import { beforeEach, describe, expect, it, vi } from "vitest"

import type { GuacamoleSDK } from "./guacamole-sdk"
import {
  GuacamoleSession,
  authenticateGuacamole,
  buildGuacamoleConnectData,
  classifyGuacamoleFailure,
  readGuacamoleTicket,
} from "./guacamole-session"

class FakeDocument {
  activeElement: FakeElement | null = null
  readonly documentElement = {}
  readonly querySelector = vi.fn().mockReturnValue(null)
  readonly defaultView: { MutationObserver: typeof MutationObserver }
  private observer?: MutationCallback

  constructor() {
    const owner = this
    this.defaultView = {
      MutationObserver: class {
        constructor(callback: MutationCallback) { owner.observer = callback }
        disconnect() {}
        observe() {}
        takeRecords() { return [] }
      },
    }
  }

  mutate() {
    this.observer?.([], {} as MutationObserver)
  }
}

class FakeElement {
  clientHeight = 900
  clientWidth = 1600
  ownerDocument = new FakeDocument()
  style: Record<string, string> = {}
  value = ""
  children: unknown[] = []
  listeners = new Map<string, EventListener>()
  localKeyboard = false

  addEventListener(type: string, listener: EventListener) { this.listeners.set(type, listener) }
  closest() { return this.localKeyboard ? this : null }
  removeEventListener(type: string) { this.listeners.delete(type) }
  focus() { this.ownerDocument.activeElement = this }
  replaceChildren(...children: unknown[]) { this.children = children }
}

function createSDK() {
  const clients: FakeClient[] = []
  const keyboards: FakeKeyboard[] = []
  const mice: FakeMouse[] = []
  const touchpads: FakeMouse[] = []
  const readers: FakeStringReader[] = []
  const writers: FakeStringWriter[] = []

  class FakeDisplay {
    readonly element = new FakeElement()
    oncursor: ((canvas: HTMLCanvasElement, x: number, y: number) => void) | null = null
    onresize: (() => void) | null = null
    scaleValue = 0
    cursorShown = false
    getElement() { return this.element as unknown as HTMLElement }
    getHeight() { return 1080 }
    getWidth() { return 1920 }
    scale(value: number) { this.scaleValue = value }
    showCursor(value: boolean) { this.cursorShown = value }
  }

  class FakeClient {
    static State = { CONNECTED: 3, DISCONNECTED: 5 }
    readonly display = new FakeDisplay()
    connectData = ""
    disconnected = false
    keyEvents: Array<[number, number]> = []
    mouseStates: unknown[] = []
    sizes: Array<[number, number]> = []
    onclipboard: ((stream: unknown, mimetype: string) => void) | null = null
    onerror: ((status: { code: number; message?: string }) => void) | null = null
    onstatechange: ((state: number) => void) | null = null
    constructor() { clients.push(this) }
    connect(data: string) { this.connectData = data }
    createClipboardStream() { return {} }
    disconnect() { this.disconnected = true }
    getDisplay() { return this.display }
    sendKeyEvent(pressed: number, keysym: number) { this.keyEvents.push([pressed, keysym]) }
    sendMouseState(state: unknown) { this.mouseStates.push({ ...state as object }) }
    sendSize(width: number, height: number) { this.sizes.push([width, height]) }
  }

  class FakeKeyboard {
    onkeydown: ((keysym: number) => boolean) | null = null
    onkeyup: ((keysym: number) => void) | null = null
    private readonly pressed = new Set<number>()
    reset = vi.fn(() => {
      for (const keysym of this.pressed) this.onkeyup?.(keysym)
      this.pressed.clear()
    })
    constructor(readonly element: Element) { keyboards.push(this) }
    press(keysym: number) {
      this.pressed.add(keysym)
      return this.onkeydown?.(keysym)
    }
    release(keysym: number) {
      if (!this.pressed.delete(keysym)) return
      this.onkeyup?.(keysym)
    }
  }

  class FakeMouse {
    listener?: (event: unknown) => void
    listeners = new Map<string, (event: unknown) => void>()
    cursor?: [HTMLCanvasElement, number, number]
    on(type: string, listener: (event: unknown) => void) { this.listeners.set(type, listener) }
    onEach(_types: string[], listener: (event: unknown) => void) { this.listener = listener }
    setCursor(canvas: HTMLCanvasElement, x: number, y: number) {
      this.cursor = [canvas, x, y]
      return true
    }
  }
  class MouseImpl extends FakeMouse { constructor() { super(); mice.push(this) } }
  class TouchpadImpl extends FakeMouse { constructor() { super(); touchpads.push(this) } }
  Object.assign(MouseImpl, { Touchpad: TouchpadImpl })

  class FakeStringReader {
    ontext: ((value: string) => void) | null = null
    onend: (() => void) | null = null
    constructor() { readers.push(this) }
  }
  class FakeStringWriter {
    text = ""
    ended = false
    constructor() { writers.push(this) }
    sendText(value: string) { this.text += value }
    sendEnd() { this.ended = true }
  }

  const sdk = {
    API_VERSION: "1.6.0",
    AudioPlayer: { getSupportedTypes: () => ["audio/L16"] },
    Client: FakeClient,
    Keyboard: FakeKeyboard,
    Mouse: MouseImpl,
    StringReader: FakeStringReader,
    StringWriter: FakeStringWriter,
    VideoPlayer: { getSupportedTypes: () => [] },
    WebSocketTunnel: class {},
  } as unknown as GuacamoleSDK
  return { clients, keyboards, mice, readers, sdk, touchpads, writers }
}

describe("Guacamole direct session", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { origin: "https://remotex.example" } },
    })
    vi.stubGlobal("InputEvent", class {
      readonly type = "input"
      constructor(readonly data: string, readonly isComposing = false) {}
    })
    vi.stubGlobal("CompositionEvent", class {
      readonly type = "compositionend"
      constructor(readonly data: string) {}
    })
  })

  it("reads the encrypted JSON ticket from the legacy connection URL", () => {
    expect(readGuacamoleTicket("/guacamole/?data=encrypted%2Bticket%3D")).toBe("encrypted+ticket=")
  })

  it("builds the direct client tunnel handshake", () => {
    const value = new URLSearchParams(buildGuacamoleConnectData({
      connectionID: "Atlas Desktop",
      authToken: "token",
      dataSource: "json",
      width: 1920,
      height: 1080,
      dpi: 192,
      audio: ["audio/L16"],
      video: [],
    }))
    expect(value.get("GUAC_ID")).toBe("Atlas Desktop")
    expect(value.get("GUAC_TYPE")).toBe("c")
    expect(value.get("GUAC_WIDTH")).toBe("1920")
    expect(value.getAll("GUAC_AUDIO")).toEqual(["audio/L16"])
    expect(value.getAll("GUAC_IMAGE")).toEqual(["image/webp", "image/png", "image/jpeg"])
  })

  it("authenticates the JSON ticket without browser storage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authToken: "token", dataSource: "json" }),
    })
    vi.stubGlobal("fetch", fetchMock)
    await expect(authenticateGuacamole("ticket", new AbortController().signal)).resolves.toEqual({ authToken: "token", dataSource: "json" })
    expect(fetchMock).toHaveBeenCalledWith("/guacamole/api/tokens", expect.objectContaining({ method: "POST" }))
    vi.unstubAllGlobals()
  })

  it.each([
    [{ code: 0x0301 }, "authentication"],
    [{ code: 0x0207 }, "dns"],
    [{ code: 0x0202 }, "timeout"],
    [{ code: 0x0201 }, "busy"],
    [{ code: 0x0209 }, "conflict"],
    [{ code: 0x0208 }, "upstream"],
    [{ code: 0x0203, message: "certificate verify failed" }, "certificate"],
    [{ code: 0x0203, message: "CredSSP security negotiation failed" }, "security"],
  ] as const)("classifies protocol failures", (status, expected) => {
    expect(classifyGuacamoleFailure(status)).toBe(expected)
  })

  it("owns the full SDK lifecycle and preserves official touchpad scroll state", async () => {
    const runtime = createSDK()
    const displayHost = new FakeElement()
    const displaySurface = new FakeElement()
    const keyboardInput = new FakeElement()
    const ready = vi.fn()
    const ended = vi.fn()
    const activity = vi.fn()
    const revoke = vi.fn().mockResolvedValue(undefined)
    const writeClipboard = vi.fn().mockResolvedValue(undefined)
    const session = new GuacamoleSession(
      displayHost as unknown as HTMLElement,
      displaySurface as unknown as HTMLElement,
      keyboardInput as unknown as HTMLTextAreaElement,
      { isActive: () => true, onActivity: activity, onDisplayResize: vi.fn(), onEnded: ended, onReady: ready },
      {
        authenticate: vi.fn().mockResolvedValue({ authToken: "token", dataSource: "json" }),
        loadSDK: vi.fn().mockResolvedValue(runtime.sdk),
        pixelRatio: () => 2,
        revoke,
        writeClipboard,
      },
    )

    await session.connect("Atlas Desktop", "/guacamole/?data=ticket")
    const client = runtime.clients[0]
    expect(new URLSearchParams(client.connectData).get("GUAC_ID")).toBe("Atlas Desktop")
    expect(runtime.keyboards[0].element).toBe(keyboardInput.ownerDocument)

    client.onstatechange?.(3)
    expect(ready).toHaveBeenCalledOnce()
    expect(keyboardInput.ownerDocument.activeElement).toBe(keyboardInput)

    session.fitDisplay()
    session.resizeRemote()
    expect(client.display.scaleValue).toBeCloseTo(5 / 6)
    expect(client.sizes).toEqual([[3200, 1800]])

    runtime.keyboards[0].press(0x4e2d)
    runtime.keyboards[0].release(0x4e2d)
    expect(client.keyEvents).toContainEqual([1, 0x4e2d])
    expect(client.keyEvents).toContainEqual([0, 0x4e2d])

    runtime.keyboards[0].press(0xffe3)
    keyboardInput.ownerDocument.querySelector.mockReturnValue({})
    expect(runtime.keyboards[0].onkeydown?.(0x61)).toBe(true)
    expect(client.keyEvents).not.toContainEqual([1, 0x61])
    keyboardInput.ownerDocument.mutate()
    expect(runtime.keyboards[0].reset).toHaveBeenCalledOnce()
    expect(runtime.keyboards[0].onkeydown).toBeNull()
    expect(runtime.keyboards[0].onkeyup).toBeNull()
    expect(client.keyEvents).toContainEqual([0, 0xffe3])

    keyboardInput.ownerDocument.querySelector.mockReturnValue(null)
    keyboardInput.ownerDocument.mutate()
    runtime.keyboards[0].press(0x61)
    runtime.keyboards[0].release(0x61)
    expect(client.keyEvents).toContainEqual([1, 0x61])
    expect(client.keyEvents).toContainEqual([0, 0x61])

    const localInput = new FakeElement()
    localInput.ownerDocument = keyboardInput.ownerDocument
    localInput.localKeyboard = true
    localInput.focus()
    const localKeyEventCount = client.keyEvents.length
    expect(runtime.keyboards[0].onkeydown?.(0x62)).toBe(true)
    runtime.keyboards[0].onkeyup?.(0x62)
    expect(client.keyEvents).toHaveLength(localKeyEventCount)
    keyboardInput.focus()

    const captured = vi.fn()
    runtime.keyboards[0].press(0xffe1)
    expect(session.captureKeys(captured)).toEqual(expect.any(Function))
    expect(client.keyEvents.at(-1)).toEqual([0, 0xffe1])
    runtime.keyboards[0].release(0xffe1)
    const keyEventCount = client.keyEvents.length
    runtime.keyboards[0].press(0xffe3)
    runtime.keyboards[0].press(0xffe5)
    runtime.keyboards[0].release(0xffe5)
    runtime.keyboards[0].release(0xffe3)
    expect(captured).toHaveBeenCalledWith([0xffe3, 0xffe5])
    expect(client.keyEvents).toHaveLength(keyEventCount)

    const cursor = {} as HTMLCanvasElement
    client.display.oncursor?.(cursor, 4, 6)
    expect(runtime.mice[0].cursor).toEqual([cursor, 4, 6])
    runtime.mice[0].listener?.({ type: "mousemove", state: { x: 1, y: 2 } })
    expect(client.display.cursorShown).toBe(false)

    keyboardInput.value = "软键盘"
    keyboardInput.listeners.get("input")?.(new InputEvent("软键盘") as unknown as Event)
    expect(keyboardInput.value).toBe("")

    const scrollState = { x: 10, y: 20, up: true, down: false }
    runtime.touchpads[0].listener?.({ type: "mouseup", state: scrollState })
    expect(client.mouseStates.at(-1)).toEqual(scrollState)
    expect(client.display.cursorShown).toBe(true)

    const paste = { clipboardData: { getData: () => "本地剪贴板" }, preventDefault: vi.fn() } as unknown as ClipboardEvent
    keyboardInput.listeners.get("paste")?.(paste)
    expect(runtime.writers.at(-1)).toMatchObject({ text: "本地剪贴板", ended: true })

    client.onclipboard?.({}, "text/plain")
    runtime.readers[0].ontext?.("远程")
    runtime.readers[0].ontext?.("剪贴板")
    runtime.readers[0].onend?.()
    await Promise.resolve()
    expect(writeClipboard).toHaveBeenCalledWith("远程剪贴板")

    await session.disconnect()
    expect(client.disconnected).toBe(true)
    expect(revoke).toHaveBeenCalledWith("token")
    expect(ended).not.toHaveBeenCalled()
  })

  it("reports a protocol error once and differentiates the cause", async () => {
    const runtime = createSDK()
    const ended = vi.fn()
    const session = new GuacamoleSession(
      new FakeElement() as unknown as HTMLElement,
      new FakeElement() as unknown as HTMLElement,
      new FakeElement() as unknown as HTMLTextAreaElement,
      { isActive: () => true, onActivity: vi.fn(), onDisplayResize: vi.fn(), onEnded: ended, onReady: vi.fn() },
      {
        authenticate: vi.fn().mockResolvedValue({ authToken: "token", dataSource: "json" }),
        loadSDK: vi.fn().mockResolvedValue(runtime.sdk),
        revoke: vi.fn().mockResolvedValue(undefined),
      },
    )
    await session.connect("Aurora Workstation", "/guacamole/?data=ticket")
    runtime.clients[0].onerror?.({ code: 0x0203, message: "TLS certificate rejected" })
    runtime.clients[0].onstatechange?.(5)
    expect(ended).toHaveBeenCalledOnce()
    expect(ended).toHaveBeenCalledWith("certificate")
  })

  it("supports per-session remote cursor rendering and reversed wheel direction", async () => {
    const runtime = createSDK()
    const session = new GuacamoleSession(
      new FakeElement() as unknown as HTMLElement,
      new FakeElement() as unknown as HTMLElement,
      new FakeElement() as unknown as HTMLTextAreaElement,
      {
        isActive: () => true,
        isRemoteCursor: () => true,
        isWheelReversed: () => true,
        onActivity: vi.fn(),
        onDisplayResize: vi.fn(),
        onEnded: vi.fn(),
        onReady: vi.fn(),
      },
      {
        authenticate: vi.fn().mockResolvedValue({ authToken: "token", dataSource: "json" }),
        loadSDK: vi.fn().mockResolvedValue(runtime.sdk),
        revoke: vi.fn().mockResolvedValue(undefined),
      },
    )

    await session.connect("Mac Console", "/guacamole/?data=ticket")
    const client = runtime.clients[0]
    client.display.oncursor?.({} as HTMLCanvasElement, 4, 6)
    expect(runtime.mice[0].cursor).toBeUndefined()
    expect(client.display.cursorShown).toBe(false)

    runtime.mice[0].listener?.({ type: "mouseup", state: { x: 10, y: 20, up: true, down: false } })
    expect(client.mouseStates.at(-1)).toEqual({ x: 10, y: 20, up: false, down: true })
    expect(client.display.cursorShown).toBe(false)
  })

  it("revokes authentication that resolves after cancellation", async () => {
    const runtime = createSDK()
    let resolveAuth!: (value: { authToken: string; dataSource: string }) => void
    const auth = new Promise<{ authToken: string; dataSource: string }>((resolve) => { resolveAuth = resolve })
    const revoke = vi.fn().mockResolvedValue(undefined)
    const session = new GuacamoleSession(
      new FakeElement() as unknown as HTMLElement,
      new FakeElement() as unknown as HTMLElement,
      new FakeElement() as unknown as HTMLTextAreaElement,
      { isActive: () => true, onActivity: vi.fn(), onDisplayResize: vi.fn(), onEnded: vi.fn(), onReady: vi.fn() },
      {
        authenticate: vi.fn().mockReturnValue(auth),
        loadSDK: vi.fn().mockResolvedValue(runtime.sdk),
        revoke,
      },
    )

    const connecting = session.connect("Atlas Desktop", "/guacamole/?data=ticket")
    await Promise.resolve()
    await session.disconnect()
    resolveAuth({ authToken: "late-token", dataSource: "json" })
    await connecting
    expect(revoke).toHaveBeenCalledWith("late-token")
    expect(runtime.clients).toHaveLength(0)
  })
})
