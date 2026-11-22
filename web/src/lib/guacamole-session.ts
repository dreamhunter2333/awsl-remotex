import type { Client, Event as GuacamoleEvent, Mouse } from "guacamole-common-js"

import { api } from "./api"
import { GuacamoleAudioPlayer } from "./guacamole-audio"
import {
  authenticateGuacamole, buildGuacamoleConnectData, classifyGuacamoleFailure, GuacamoleSessionError,
  readGuacamoleTicket, revokeGuacamoleSession, type GuacamoleAuthResponse, type GuacamoleFailure,
} from "./guacamole-connection"
import { registerDocumentKeyboard, type DocumentKeyboardRegistration } from "./guacamole-keyboard"
import { guacamoleKeys, sendKeyCombination } from "./guacamole-keys"
import { loadGuacamoleSDK, type GuacamoleSDK } from "./guacamole-sdk"

const CAPS_LOCK_HOLD_MS = 150

export type ClipboardDirection = "local-to-remote" | "remote-to-local"

interface GuacamoleSessionCallbacks {
  isActive: () => boolean
  isRemoteCursor?: () => boolean
  isWheelReversed?: () => boolean
  onActivity: () => void
  onAudioCapability?: (supported: boolean) => void
  onClipboard?: (direction: ClipboardDirection, succeeded: boolean, text?: string) => void
  onDisplayResize: () => void
  onEnded: (failure: GuacamoleFailure) => void
  onReady: () => void
}

interface GuacamoleSessionDependencies {
  authenticate?: typeof authenticateGuacamole
  loadSDK?: typeof loadGuacamoleSDK
  pixelRatio?: () => number
  readClipboard?: () => Promise<string>
  revoke?: typeof revokeGuacamoleSession
  writeClipboard?: (text: string) => Promise<void>
}

export class GuacamoleSession {
  private abortController?: AbortController
  private audioTypes: readonly string[] = []
  private audioContext?: AudioContext
  private audioEnabled = false
  private readonly audioPlayers = new Set<GuacamoleAudioPlayer>()
  private client?: Client
  private connected = false
  private generation = 0
  private keyboard?: DocumentKeyboardRegistration
  private clipboardRevision = 0
  private clipboardSync?: Promise<boolean>
  private lastClipboard?: string
  private reported = false
  private sdk?: GuacamoleSDK
  private token = ""

  constructor(
    private readonly displayHost: HTMLElement,
    private readonly displaySurface: HTMLElement,
    private readonly keyboardInput: HTMLTextAreaElement,
    private readonly callbacks: GuacamoleSessionCallbacks,
    private readonly dependencies: GuacamoleSessionDependencies = {},
  ) {
    this.keyboardInput.addEventListener("keypress", this.clearInput)
    this.keyboardInput.addEventListener("compositionend", this.clearInput)
    this.keyboardInput.addEventListener("input", this.clearInput)
  }

  async connect(connectionID: string, connectionURL: string) {
    const generation = ++this.generation
    void this.releaseCurrent()
    ++this.clipboardRevision
    this.lastClipboard = undefined
    this.reported = false
    const controller = new AbortController()
    this.abortController = controller
    const { signal } = controller
    const isCurrent = () => generation === this.generation && !signal.aborted

    try {
      const ticket = readGuacamoleTicket(connectionURL)
      if (!ticket) throw new GuacamoleSessionError("authentication", "Guacamole ticket is missing")
      const sdk = await (this.dependencies.loadSDK ?? loadGuacamoleSDK)()
      if (!isCurrent()) return
      this.sdk = sdk
      this.audioTypes = sdk.AudioPlayer.getSupportedTypes()
      const auth = await (this.dependencies.authenticate ?? authenticateGuacamole)(ticket, signal)
      if (!isCurrent()) {
        void (this.dependencies.revoke ?? revokeGuacamoleSession)(auth.authToken)
        return
      }

      this.token = auth.authToken
      const tunnelTicket = await api.tunnelTicket(signal)
      if (!isCurrent()) return
      this.ensureKeyboard()
      this.createClient(connectionID, auth, tunnelTicket)
    } catch (reason) {
      if (isCurrent()) this.finish(classifyGuacamoleFailure(reason))
    }
  }

  async disconnect() {
    ++this.generation
    this.reported = true
    await this.releaseCurrent()
  }

  async dispose() {
    this.keyboardInput.removeEventListener("keypress", this.clearInput)
    this.keyboardInput.removeEventListener("compositionend", this.clearInput)
    this.keyboardInput.removeEventListener("input", this.clearInput)
    await this.disconnect()
    this.keyboard?.unregister()
    this.keyboard = undefined
  }

  focus() {
    this.keyboardInput.focus({ preventScroll: true })
    return this.keyboardInput.ownerDocument.activeElement === this.keyboardInput
  }

  setAudioEnabled(enabled: boolean) {
    this.audioEnabled = enabled
    for (const player of this.audioPlayers) player.setEnabled(enabled)
    if (enabled && this.audioContext && this.audioContext.state !== "running") {
      const context = this.audioContext
      void context.resume().catch(() => {
        if (this.audioContext !== context) return
        this.setAudioEnabled(false)
        this.callbacks.onAudioCapability?.(false)
      })
    }
  }

  async syncClipboard() {
    await this.readClipboardOnce()
  }

  private readClipboardOnce() {
    if (!this.connected || !this.callbacks.isActive()) return Promise.resolve(false)
    if (this.clipboardSync) return this.clipboardSync
    const pending = this.readLocalClipboard().finally(() => {
      if (this.clipboardSync === pending) this.clipboardSync = undefined
    })
    this.clipboardSync = pending
    return pending
  }

  private async readLocalClipboard() {
    const generation = this.generation
    const clipboardRevision = this.clipboardRevision
    const isCurrent = () => generation === this.generation && clipboardRevision === this.clipboardRevision && this.connected && this.callbacks.isActive()
    const read = this.dependencies.readClipboard ?? (() => navigator.clipboard?.readText() ?? Promise.reject(new Error("Clipboard API is unavailable")))
    try {
      const text = await read()
      if (!isCurrent()) return false
      if (text === this.lastClipboard) return true
      if (!this.sendClipboard(text)) throw new Error("Clipboard stream is unavailable")
      this.lastClipboard = text
      this.callbacks.onClipboard?.("local-to-remote", true, text)
      return true
    } catch {
      if (isCurrent()) this.callbacks.onClipboard?.("local-to-remote", false)
      return false
    }
  }

  private async pasteClipboard(paste: () => void) {
    const generation = this.generation
    const synced = await this.readClipboardOnce()
    if (!synced || generation !== this.generation || !this.connected || !this.callbacks.isActive()) return
    paste()
  }

  sendKeys(keys: readonly number[]) {
    const holdMs = keys.includes(guacamoleKeys.capsLock) ? CAPS_LOCK_HOLD_MS : 0
    const sent = sendKeyCombination(this.client, keys, holdMs)
    if (sent) this.callbacks.onActivity()
    return sent
  }

  captureKeys(onComplete: (keys: readonly number[]) => void) {
    if (!this.connected) return
    return this.keyboard?.capture(onComplete)
  }

  sendClipboard(text: string) {
    if (!this.client || !this.sdk) return false
    const writer = new this.sdk.StringWriter(this.client.createClipboardStream("text/plain"))
    writer.sendText(text)
    writer.sendEnd()
    this.callbacks.onActivity()
    return true
  }

  setClipboard(text: string) {
    if (!this.connected || !this.callbacks.isActive()) {
      if (this.callbacks.isActive()) this.callbacks.onClipboard?.("local-to-remote", false, text)
      return false
    }
    if (text === this.lastClipboard) return true
    ++this.clipboardRevision
    const succeeded = this.sendClipboard(text)
    if (succeeded) {
      this.lastClipboard = text
    }
    this.callbacks.onClipboard?.("local-to-remote", succeeded, text)
    return succeeded
  }

  fitDisplay() {
    if (!this.client) return
    const display = this.client.getDisplay()
    const width = display.getWidth()
    const height = display.getHeight()
    if (!width || !height || !this.displayHost.clientWidth || !this.displayHost.clientHeight) return
    const scale = Math.min(this.displayHost.clientWidth / width, this.displayHost.clientHeight / height)
    this.displaySurface.style.width = `${Math.floor(width * scale)}px`
    this.displaySurface.style.height = `${Math.floor(height * scale)}px`
    display.scale(scale)
  }

  resizeRemote() {
    if (!this.client || !this.connected || !this.callbacks.isActive()) return
    const ratio = (this.dependencies.pixelRatio ?? (() => window.devicePixelRatio || 1))()
    this.client.sendSize(
      Math.max(1, Math.floor(this.displayHost.clientWidth * ratio)),
      Math.max(1, Math.floor(this.displayHost.clientHeight * ratio)),
    )
  }

  private ensureKeyboard() {
    if (this.keyboard || !this.sdk) return
    this.keyboard = registerDocumentKeyboard(this.sdk, this.keyboardInput.ownerDocument, {
      isActive: () => this.connected && this.callbacks.isActive(),
      onkeydown: (keysym) => {
        this.client?.sendKeyEvent(1, keysym)
        this.callbacks.onActivity()
      },
      onpaste: (text) => this.setClipboard(text),
      onPasteShortcut: (paste) => { void this.pasteClipboard(paste) },
      onkeyup: (keysym) => this.client?.sendKeyEvent(0, keysym),
    })
  }

  private createClient(connectionID: string, auth: GuacamoleAuthResponse, tunnelTicket?: string) {
    if (!this.sdk) return
    const sdk = this.sdk
    const tunnel = new sdk.WebSocketTunnel("/guacamole/websocket-tunnel")
    const client = new sdk.Client(tunnel)
    this.client = client
    this.connected = false

    const display = client.getDisplay()
    const displayElement = display.getElement()
    displayElement.style.position = "absolute"
    displayElement.style.inset = "0 auto auto 0"
    displayElement.style.cursor = "none"
    this.displaySurface.replaceChildren(displayElement)

    let localCursor = false
    const sendMouseState = (state: Mouse.State) => {
      if (!this.callbacks.isWheelReversed?.() || state.up === state.down) {
        client.sendMouseState(state, true)
        return
      }
      const { up, down } = state
      try {
        state.up = down
        state.down = up
        client.sendMouseState(state, true)
      } finally {
        state.up = up
        state.down = down
      }
    }
    const sendMouse = (event: GuacamoleEvent, focus: boolean, softwareCursor: boolean) => {
      const mouseEvent = event as Mouse.Event
      const remoteCursor = this.callbacks.isRemoteCursor?.() ?? false
      display.showCursor(!remoteCursor && (softwareCursor || !localCursor))
      sendMouseState(mouseEvent.state)
      if (mouseEvent.type !== "mousemove") this.callbacks.onActivity()
      if (focus && mouseEvent.type === "mousedown") this.focus()
    }
    const mouse = new sdk.Mouse(displayElement)
    display.oncursor = (canvas, x, y) => {
      if (this.callbacks.isRemoteCursor?.()) {
        localCursor = false
        displayElement.style.cursor = "none"
        display.showCursor(false)
        return
      }
      localCursor = mouse.setCursor(canvas, x, y)
      if (!localCursor) displayElement.style.cursor = "none"
    }
    mouse.onEach(["mousedown", "mousemove", "mouseup"], (event) => sendMouse(event, true, false))
    mouse.on("mouseout", () => display.showCursor(false))
    const touchpad = new sdk.Mouse.Touchpad(displayElement)
    touchpad.onEach(["mousedown", "mousemove", "mouseup"], (event) => sendMouse(event, false, true))

    client.onaudio = (stream, mimetype) => {
      const format = sdk.RawAudioFormat.parse(mimetype)
      const Context = window.AudioContext ?? window.webkitAudioContext
      if (!format || !Context) return { sync() {} }
      try {
        this.audioContext ??= new Context()
        const player = new GuacamoleAudioPlayer(sdk, stream, format, this.audioContext, () => {
          if (this.client === client) this.callbacks.onAudioCapability?.(true)
        })
        player.setEnabled(this.audioEnabled)
        this.audioPlayers.add(player)
        return player
      } catch {
        return { sync() {} }
      }
    }
    client.onclipboard = (stream, mimetype) => {
      if (!mimetype.startsWith("text/")) return
      const reader = new sdk.StringReader(stream)
      let text = ""
      reader.ontext = (value) => { text += value }
      reader.onend = () => {
        if (this.client === client) void this.writeClipboard(text)
      }
    }
    display.onresize = () => this.callbacks.onDisplayResize()
    client.onerror = (status) => {
      if (this.client === client) this.finish(classifyGuacamoleFailure(status))
    }
    client.onstatechange = (state) => {
      if (this.client !== client) return
      if (state === sdk.Client.State.CONNECTED) {
        this.connected = true
        this.callbacks.onReady()
        this.callbacks.onDisplayResize()
        if (this.callbacks.isActive()) this.focus()
        return
      }
      if (state === sdk.Client.State.DISCONNECTED) this.finish("disconnected")
    }

    const ratio = (this.dependencies.pixelRatio ?? (() => window.devicePixelRatio || 1))()
    client.connect(buildGuacamoleConnectData({
      connectionID,
      tunnelTicket,
      authToken: auth.authToken,
      dataSource: auth.dataSource,
      width: Math.max(1, Math.floor(this.displayHost.clientWidth * ratio)),
      height: Math.max(1, Math.floor(this.displayHost.clientHeight * ratio)),
      dpi: Math.max(96, Math.floor(96 * ratio)),
      audio: this.audioTypes,
      video: sdk.VideoPlayer.getSupportedTypes(),
    }))
  }

  private finish(failure: GuacamoleFailure) {
    if (this.reported) return
    this.reported = true
    this.callbacks.onEnded(failure)
  }

  private async releaseCurrent() {
    this.setAudioEnabled(false)
    this.audioPlayers.clear()
    const audioContext = this.audioContext
    this.audioContext = undefined
    if (audioContext) void audioContext.close().catch(() => undefined)
    this.callbacks.onAudioCapability?.(false)
    this.abortController?.abort()
    this.abortController = undefined
    this.clipboardSync = undefined
    this.connected = false
    this.keyboard?.release()

    const client = this.client
    this.client = undefined
    if (client) {
      client.onaudio = () => ({ sync() {} })
      client.onclipboard = null
      client.onerror = null
      client.onstatechange = null
      client.getDisplay().oncursor = null
      client.getDisplay().onresize = null
      client.disconnect()
    }
    this.displaySurface.replaceChildren()

    const token = this.token
    this.token = ""
    await (this.dependencies.revoke ?? revokeGuacamoleSession)(token)
  }

  private async writeClipboard(text: string) {
    if (!this.connected || !this.callbacks.isActive()) return
    const write = this.dependencies.writeClipboard ?? ((value: string) => navigator.clipboard?.writeText(value) ?? Promise.reject(new Error("Clipboard API is unavailable")))
    const generation = this.generation
    const clipboardRevision = ++this.clipboardRevision
    const previousClipboard = this.lastClipboard
    this.lastClipboard = text
    try {
      await write(text)
      if (generation !== this.generation || clipboardRevision !== this.clipboardRevision || !this.connected || !this.callbacks.isActive()) return
      this.callbacks.onClipboard?.("remote-to-local", true, text)
    } catch {
      if (generation !== this.generation || clipboardRevision !== this.clipboardRevision || !this.connected || !this.callbacks.isActive()) return
      this.lastClipboard = previousClipboard
      this.callbacks.onClipboard?.("remote-to-local", false, text)
    }
  }

  private readonly clearInput = (event: Event) => {
    if (event.type === "keypress") {
      this.keyboardInput.value = ""
      return
    }
    if (event instanceof CompositionEvent && event.data) {
      this.keyboardInput.value = ""
      return
    }
    if (event instanceof InputEvent && event.data && !event.isComposing) this.keyboardInput.value = ""
  }
}
