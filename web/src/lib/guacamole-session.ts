import type { Client, Event as GuacamoleEvent, Mouse, Status } from "guacamole-common-js"

import { sendKeyCombination, type KeyEventSender } from "./guacamole-keys"
import { GuacamoleSDKError, loadGuacamoleSDK, type GuacamoleSDK } from "./guacamole-sdk"

export interface GuacamoleAuthResponse {
  authToken: string
  dataSource: string
}

export type GuacamoleFailure = "sdk" | "authentication" | "forbidden" | "dns" | "certificate" | "security" | "timeout" | "busy" | "conflict" | "upstream" | "disconnected"

export class GuacamoleSessionError extends Error {
  constructor(readonly failure: GuacamoleFailure, message: string) {
    super(message)
  }
}

export function readGuacamoleTicket(connectionURL: string) {
  return new URL(connectionURL, window.location.origin).searchParams.get("data") ?? ""
}

export async function authenticateGuacamole(ticket: string, signal: AbortSignal): Promise<GuacamoleAuthResponse> {
  const response = await fetch("/guacamole/api/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: ticket }),
    signal,
  })
  if (!response.ok) {
    const failure = response.status === 401 ? "authentication"
      : response.status === 403 ? "forbidden"
        : response.status === 408 ? "timeout"
          : response.status === 409 ? "conflict"
            : response.status === 429 ? "busy"
              : response.status >= 500 ? "upstream" : "authentication"
    throw new GuacamoleSessionError(failure, `Guacamole authentication failed (${response.status})`)
  }
  const result = await response.json() as Partial<GuacamoleAuthResponse>
  if (!result.authToken || !result.dataSource) throw new GuacamoleSessionError("upstream", "Guacamole returned an invalid authentication response")
  return { authToken: result.authToken, dataSource: result.dataSource }
}

export function buildGuacamoleConnectData(options: {
  connectionID: string
  authToken: string
  dataSource: string
  width: number
  height: number
  dpi: number
  audio: readonly string[]
  video: readonly string[]
}) {
  const parameters = new URLSearchParams({
    token: options.authToken,
    GUAC_DATA_SOURCE: options.dataSource,
    GUAC_ID: options.connectionID,
    GUAC_TYPE: "c",
    GUAC_WIDTH: String(options.width),
    GUAC_HEIGHT: String(options.height),
    GUAC_DPI: String(options.dpi),
    GUAC_TIMEZONE: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
  for (const mimetype of options.audio) parameters.append("GUAC_AUDIO", mimetype)
  for (const mimetype of options.video) parameters.append("GUAC_VIDEO", mimetype)
  for (const mimetype of ["image/webp", "image/png", "image/jpeg"]) parameters.append("GUAC_IMAGE", mimetype)
  return parameters.toString()
}

export function revokeGuacamoleSession(token: string) {
  if (!token) return Promise.resolve()
  const encoded = encodeURIComponent(token)
  return fetch(`/guacamole/api/session?token=${encoded}`, {
    method: "DELETE",
    headers: { "Guacamole-Token": token },
    keepalive: true,
  }).then(() => undefined, () => undefined)
}

export function classifyGuacamoleFailure(reason: unknown): GuacamoleFailure {
  if (reason instanceof GuacamoleSessionError) return reason.failure
  if (reason instanceof GuacamoleSDKError) return "sdk"

  const status = reason as Partial<Pick<Status, "code" | "message">> | undefined
  const message = status?.message ?? (reason instanceof Error ? reason.message : "")
  if (/certificate|\bcert\b/i.test(message)) return "certificate"
  if (/credssp|security|tls|nla|protocol/i.test(message)) return "security"
  if (/authentication|credentials|password|logon|unauthorized/i.test(message)) return "authentication"
  if (/dns|hostname|resolve|name or service not known/i.test(message)) return "dns"

  switch (status?.code) {
    case 0x0301: return "authentication"
    case 0x0303: return "forbidden"
    case 0x0202:
    case 0x020a:
    case 0x0308: return "timeout"
    case 0x0201:
    case 0x031d: return "busy"
    case 0x0204:
    case 0x0207: return "dns"
    case 0x0205:
    case 0x0209: return "conflict"
    case 0x0203:
    case 0x0208: return "upstream"
    default: return "disconnected"
  }
}

interface GuacamoleSessionCallbacks {
  isActive: () => boolean
  isRemoteCursor?: () => boolean
  isWheelReversed?: () => boolean
  onActivity: () => void
  onDisplayResize: () => void
  onEnded: (failure: GuacamoleFailure) => void
  onReady: () => void
}

interface GuacamoleSessionDependencies {
  authenticate?: typeof authenticateGuacamole
  loadSDK?: typeof loadGuacamoleSDK
  pixelRatio?: () => number
  revoke?: typeof revokeGuacamoleSession
  writeClipboard?: (text: string) => Promise<void>
}

interface DocumentKeyboardTarget {
  isActive: () => boolean
  onkeydown: (keysym: number) => void
  onkeyup: (keysym: number) => void
}

interface DocumentKeyboardRegistration {
  capture: (onComplete: (keys: readonly number[]) => void) => () => void
  release: () => void
  unregister: () => void
}

interface DocumentKeyboardCapture {
  keys: number[]
  pressed: Set<number>
  onComplete: (keys: readonly number[]) => void
}

class DocumentKeyboardRouter {
  private capture?: DocumentKeyboardCapture
  private observer?: MutationObserver
  private readonly owners = new Map<number, DocumentKeyboardTarget>()
  private readonly targets = new Set<DocumentKeyboardTarget>()

  constructor(sdk: GuacamoleSDK, private readonly document: Document) {
    const keyboard = new sdk.Keyboard(document)
    const onkeydown = (keysym: number) => {
      if (this.capture) {
        if (!this.capture.keys.includes(keysym)) this.capture.keys.push(keysym)
        this.capture.pressed.add(keysym)
        return false
      }
      const target = this.getActiveTarget()
      if (!target) return true
      this.owners.set(keysym, target)
      target.onkeydown(keysym)
      return false
    }
    const onkeyup = (keysym: number) => {
      if (this.capture) {
        const capture = this.capture
        capture.pressed.delete(keysym)
        if (capture.pressed.size === 0 && capture.keys.length > 0) {
          this.capture = undefined
          capture.onComplete(capture.keys)
        }
        return
      }
      const target = this.owners.get(keysym)
      if (!target) return
      this.owners.delete(keysym)
      target.onkeyup(keysym)
    }
    keyboard.onkeydown = onkeydown
    keyboard.onkeyup = onkeyup

    let suspended = false
    const updateSuspension = () => {
      const next = Boolean(this.document.querySelector("dialog[open]"))
      if (next === suspended) return
      suspended = next
      if (suspended) {
        keyboard.reset()
        keyboard.onkeydown = null
        keyboard.onkeyup = null
        return
      }
      keyboard.onkeydown = onkeydown
      keyboard.onkeyup = onkeyup
    }
    const Observer = document.defaultView?.MutationObserver
    if (Observer) {
      this.observer = new Observer(updateSuspension)
      this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ["open"], subtree: true })
    }
    updateSuspension()
  }

  register(target: DocumentKeyboardTarget): DocumentKeyboardRegistration {
    this.targets.add(target)
    return {
      capture: (onComplete) => {
        this.releaseAll()
        return this.captureKeys(onComplete)
      },
      release: () => this.release(target),
      unregister: () => {
        this.release(target)
        this.targets.delete(target)
      },
    }
  }

  private release(target: DocumentKeyboardTarget) {
    for (const [keysym, owner] of this.owners) {
      if (owner !== target) continue
      this.owners.delete(keysym)
      target.onkeyup(keysym)
    }
  }

  private releaseAll() {
    for (const [keysym, target] of this.owners) {
      this.owners.delete(keysym)
      target.onkeyup(keysym)
    }
  }

  private captureKeys(onComplete: (keys: readonly number[]) => void) {
    const capture: DocumentKeyboardCapture = { keys: [], pressed: new Set(), onComplete }
    this.capture = capture
    return () => {
      if (this.capture === capture) this.capture = undefined
    }
  }

  private getActiveTarget() {
    if (this.document.querySelector("dialog[open]")) return
    if (this.document.activeElement?.closest("[data-local-keyboard]")) return
    return [...this.targets].find((target) => target.isActive())
  }
}

const documentKeyboards = new WeakMap<Document, DocumentKeyboardRouter>()

function getDocumentKeyboard(sdk: GuacamoleSDK, document: Document) {
  const existing = documentKeyboards.get(document)
  if (existing) return existing
  const keyboard = new DocumentKeyboardRouter(sdk, document)
  documentKeyboards.set(document, keyboard)
  return keyboard
}

export class GuacamoleSession implements KeyEventSender {
  private abortController?: AbortController
  private client?: Client
  private connected = false
  private generation = 0
  private keyboard?: DocumentKeyboardRegistration
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
    this.keyboardInput.addEventListener("paste", this.onPaste)
    this.keyboardInput.addEventListener("keypress", this.clearInput)
    this.keyboardInput.addEventListener("compositionend", this.clearInput)
    this.keyboardInput.addEventListener("input", this.clearInput)
  }

  async connect(connectionID: string, connectionURL: string) {
    const generation = ++this.generation
    void this.releaseCurrent()
    this.reported = false
    this.abortController = new AbortController()

    try {
      const ticket = readGuacamoleTicket(connectionURL)
      if (!ticket) throw new GuacamoleSessionError("authentication", "Guacamole ticket is missing")
      const sdk = await (this.dependencies.loadSDK ?? loadGuacamoleSDK)()
      if (generation !== this.generation) return
      const auth = await (this.dependencies.authenticate ?? authenticateGuacamole)(ticket, this.abortController.signal)
      if (generation !== this.generation) {
        void (this.dependencies.revoke ?? revokeGuacamoleSession)(auth.authToken)
        return
      }

      this.sdk = sdk
      this.token = auth.authToken
      this.ensureKeyboard()
      this.createClient(connectionID, auth)
    } catch (reason) {
      if (generation !== this.generation || this.abortController?.signal.aborted) return
      this.finish(classifyGuacamoleFailure(reason))
    }
  }

  async disconnect() {
    ++this.generation
    this.reported = true
    await this.releaseCurrent()
  }

  async dispose() {
    this.keyboardInput.removeEventListener("paste", this.onPaste)
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

  sendKeyEvent(pressed: 0 | 1, keysym: number) {
    this.client?.sendKeyEvent(pressed, keysym)
  }

  sendKeys(keys: readonly number[]) {
    return sendKeyCombination(this.client, keys)
  }

  captureKeys(onComplete: (keys: readonly number[]) => void) {
    if (!this.connected) return
    return this.keyboard?.capture(onComplete)
  }

  sendClipboard(text: string) {
    if (!this.client || !this.sdk || !text) return false
    const writer = new this.sdk.StringWriter(this.client.createClipboardStream("text/plain"))
    writer.sendText(text)
    writer.sendEnd()
    this.callbacks.onActivity()
    return true
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
    this.keyboard = getDocumentKeyboard(this.sdk, this.keyboardInput.ownerDocument).register({
      isActive: () => this.connected && this.callbacks.isActive(),
      onkeydown: (keysym) => {
        this.client?.sendKeyEvent(1, keysym)
        this.callbacks.onActivity()
      },
      onkeyup: (keysym) => this.client?.sendKeyEvent(0, keysym),
    })
  }

  private createClient(connectionID: string, auth: GuacamoleAuthResponse) {
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

    client.onclipboard = (stream, mimetype) => {
      if (!mimetype.startsWith("text/")) return
      const reader = new sdk.StringReader(stream)
      let text = ""
      reader.ontext = (value) => { text += value }
      reader.onend = () => void this.writeClipboard(text)
    }
    display.onresize = () => this.callbacks.onDisplayResize()
    client.onerror = (status) => this.finish(classifyGuacamoleFailure(status))
    client.onstatechange = (state) => {
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
      authToken: auth.authToken,
      dataSource: auth.dataSource,
      width: Math.max(1, Math.floor(this.displayHost.clientWidth * ratio)),
      height: Math.max(1, Math.floor(this.displayHost.clientHeight * ratio)),
      dpi: Math.max(96, Math.floor(96 * ratio)),
      audio: sdk.AudioPlayer.getSupportedTypes(),
      video: sdk.VideoPlayer.getSupportedTypes(),
    }))
  }

  private finish(failure: GuacamoleFailure) {
    if (this.reported) return
    this.reported = true
    this.callbacks.onEnded(failure)
  }

  private async releaseCurrent() {
    this.abortController?.abort()
    this.abortController = undefined
    this.connected = false
    this.keyboard?.release()

    const client = this.client
    this.client = undefined
    if (client) {
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

  private writeClipboard(text: string) {
    const write = this.dependencies.writeClipboard ?? ((value: string) => navigator.clipboard?.writeText(value) ?? Promise.resolve())
    return write(text).catch(() => undefined)
  }

  private readonly onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData("text/plain") ?? ""
    if (!text || !this.sendClipboard(text)) return
    event.preventDefault()
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
