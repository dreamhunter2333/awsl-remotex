// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "./App"
import { api, type Asset, type ConnectionTicket } from "@/lib/api"
import { loadSessions } from "@/lib/sessions"

const { disconnect } = vi.hoisted(() => ({ disconnect: vi.fn() }))
vi.mock("@/lib/guacamole-session", () => ({
  GuacamoleSession: class {
    connect = vi.fn().mockResolvedValue(undefined)
    disconnect = disconnect
    dispose = vi.fn().mockResolvedValue(undefined)
  },
}))
vi.mock("@/lib/preferences", () => ({ usePreferences: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/preference-controls", () => ({ PreferenceControls: () => null }))

const assets: Asset[] = ["A", "B"].map((id) => ({
  id, name: id, group: "", protocol: "ssh", host: "localhost", port: 22,
  username: "", credentialType: "prompt", credentialConfigured: false, createdAt: "", updatedAt: "",
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe("logout lifecycle", () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
    vi.stubGlobal("FormData", document.defaultView!.FormData)
    vi.stubGlobal("matchMedia", () => ({ matches: false }))
    const storage = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
    disconnect.mockResolvedValue(undefined)
    vi.spyOn(api, "authStatus").mockResolvedValue({ required: true, authenticated: true, sessionIdleSeconds: 86_400 })
    vi.spyOn(api, "listAssets").mockResolvedValue(assets)
    vi.spyOn(api, "connectAsset").mockImplementation(async (id) => ({ url: `ticket-${id}`, expiresAt: "" }))
    vi.spyOn(api, "login").mockResolvedValue(undefined)
    vi.spyOn(api, "logout").mockResolvedValue(undefined)
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root.render(<App />))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  const open = (button: HTMLButtonElement) => button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
  const assetButtons = () => [...document.querySelectorAll<HTMLButtonElement>('aside button[title="doubleClickConnect"]')]

  it("blocks new connections through disconnect and logout, then signs in with no retained sessions", async () => {
    const closing = deferred<void>()
    const loggingOut = deferred<void>()
    await act(async () => open(assetButtons()[0]))
    const otherAsset = assetButtons()[1]
    disconnect.mockReturnValueOnce(closing.promise)
    vi.mocked(api.logout).mockReturnValue(loggingOut.promise)
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="logout"]')!.click())
    expect(document.querySelector("aside")).toBeNull()
    expect(host.textContent).toContain("signingOut")
    expect(api.logout).not.toHaveBeenCalled()
    await act(async () => open(otherAsset))
    expect(api.connectAsset).toHaveBeenCalledTimes(1)
    await act(async () => closing.resolve())
    expect(api.logout).toHaveBeenCalledTimes(1)
    expect(host.textContent).toContain("signingOut")
    expect(loadSessions().ids).toEqual([])
    await act(async () => loggingOut.resolve())
    expect(document.querySelector('input[type="password"]')).not.toBeNull()
    await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(api.login).toHaveBeenCalledTimes(1)
    expect(document.querySelector("aside")).not.toBeNull()
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(0)
    expect(loadSessions().ids).toEqual([])
    expect(api.connectAsset).toHaveBeenCalledTimes(1)
  })

  it("recovers the workspace after logout fails and permits a fresh connection and retry", async () => {
    vi.mocked(api.logout).mockRejectedValueOnce(new Error("logout failed"))
    await act(async () => open(assetButtons()[0]))
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="logout"]')!.click())
    expect(host.textContent).toContain("logout failed")
    expect(document.querySelector("aside")).not.toBeNull()
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(0)
    await act(async () => open(assetButtons()[1]))
    expect(api.connectAsset).toHaveBeenLastCalledWith("B", expect.any(String), expect.any(AbortSignal))
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="logout"]')!.click())
    expect(api.logout).toHaveBeenCalledTimes(2)
    expect(document.querySelector('input[type="password"]')).not.toBeNull()
    expect(loadSessions().ids).toEqual([])
  })

  it("ignores duplicate logout clicks and discards a late ticket response", async () => {
    const ticket = deferred<ConnectionTicket>()
    const loggingOut = deferred<void>()
    vi.mocked(api.connectAsset).mockReturnValue(ticket.promise)
    vi.mocked(api.logout).mockReturnValue(loggingOut.promise)
    await act(async () => open(assetButtons()[0]))
    const signal = vi.mocked(api.connectAsset).mock.calls[0][2]!
    const logout = document.querySelector<HTMLButtonElement>('button[aria-label="logout"]')!
    await act(async () => { logout.click(); logout.click() })
    expect(api.logout).toHaveBeenCalledTimes(1)
    expect(signal.aborted).toBe(true)
    await act(async () => { loggingOut.resolve(); ticket.resolve({ url: "late-ticket", expiresAt: "" }) })
    expect(document.querySelector('input[type="password"]')).not.toBeNull()
    expect(loadSessions().ids).toEqual([])
  })

  it("bounds the logout request and leaves the waiting screen when it times out", async () => {
    vi.mocked(api.logout).mockRestore()
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal)
    const fetch = vi.fn((_path: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(controller.signal.reason))
    }))
    vi.stubGlobal("fetch", fetch)
    await act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="logout"]')!.click())
    expect(host.textContent).toContain("signingOut")
    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(fetch).toHaveBeenCalledWith("/api/auth/session", expect.objectContaining({ method: "DELETE", signal: controller.signal }))
    await act(async () => controller.abort(new DOMException("Logout timed out", "TimeoutError")))
    expect(document.querySelector("aside")).not.toBeNull()
    expect(host.textContent).toContain("connectionFailed")
  })
})
