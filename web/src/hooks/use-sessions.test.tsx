// @vitest-environment jsdom
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, type Asset, type ConnectionTicket } from "@/lib/api"
import { saveSessions } from "@/lib/sessions"
import { useSessions } from "./use-sessions"

const asset: Asset = {
  id: "first", name: "First", group: "", protocol: "ssh", host: "localhost", port: 22,
  username: "", credentialType: "prompt", credentialConfigured: false, createdAt: "", updatedAt: "",
}
const second = { ...asset, id: "second" }
const ticket = (url: string): ConnectionTicket => ({ url, expiresAt: "" })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe("session connection cancellation", () => {
  let root: Root
  let host: HTMLDivElement
  let session: ReturnType<typeof useSessions>

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    const storage = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })
    vi.useFakeTimers()
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    function Capture() {
      session = useSessions([asset, second], false, 60_000, "failed", "ended")
      return null
    }
    await act(async () => root.render(<Capture />))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("aborts in-flight work and skips queued assets on reset", async () => {
    const pending = deferred<ConnectionTicket>()
    const connect = vi.spyOn(api, "connectAsset").mockReturnValue(pending.promise)
    await act(async () => { session.open(asset); session.open(second) })
    expect(connect).toHaveBeenCalledTimes(1)
    const signal = connect.mock.calls[0][2]!
    await act(async () => { await session.reset() })
    expect(signal.aborted).toBe(true)
    expect(session.connectingIDs.size).toBe(0)
    await act(async () => pending.resolve(ticket("old-ticket")))
    expect(connect).toHaveBeenCalledTimes(1)
    expect(session.sessions).toEqual([])
    expect(session.connectionURLs).toEqual({})
    expect(session.connectionErrors).toEqual({})
  })

  it("starts a fresh queue after reset without stale cleanup affecting the new request", async () => {
    const old = deferred<ConnectionTicket>()
    const fresh = deferred<ConnectionTicket>()
    const connect = vi.spyOn(api, "connectAsset").mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise)
    await act(async () => session.open(asset))
    await act(async () => { await session.reset(); session.open(asset) })
    expect(connect).toHaveBeenCalledTimes(2)
    await act(async () => old.reject(new Error("old error")))
    expect(session.connectingIDs.has(asset.id)).toBe(true)
    expect(session.connectionErrors[asset.id]).toBe("")
    await act(async () => fresh.resolve(ticket("fresh-ticket")))
    expect(session.connectionURLs[asset.id]).toBe("fresh-ticket")
    await act(async () => session.ready(asset.id))
    expect(session.connectingIDs.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cancels a queued connection when closed", async () => {
    const connect = vi.spyOn(api, "connectAsset").mockResolvedValue(ticket("first-ticket"))
    await act(async () => { session.open(asset); session.open(second) })
    await act(async () => { session.close(second.id); session.ready(asset.id) })
    expect(connect).toHaveBeenCalledTimes(1)
    expect(session.sessions).toEqual([asset.id])
    expect(session.connectingIDs.size).toBe(0)
  })

  it("reconnects with a fresh ticket after cancelling an in-flight request", async () => {
    const connect = vi.spyOn(api, "connectAsset").mockImplementationOnce((_id, _theme, signal) => new Promise((_resolve, reject) => {
      signal!.addEventListener("abort", () => reject(new Error("aborted")))
    })).mockResolvedValue(ticket("fresh-ticket"))
    await act(async () => session.open(asset))
    await act(async () => session.reconnect(asset))
    expect(connect).toHaveBeenCalledTimes(2)
    expect(session.connectionURLs[asset.id]).toBe("fresh-ticket")
    expect(session.connectionErrors[asset.id]).toBe("")
    expect(session.connectingIDs.has(asset.id)).toBe(true)
    await act(async () => session.ready(asset.id))
    expect(session.connectingIDs.size).toBe(0)
  })

  it("clears readiness timers on reset and ignores callbacks for removed sessions", async () => {
    vi.spyOn(api, "connectAsset").mockResolvedValue(ticket("ticket"))
    await act(async () => session.open(asset))
    expect(vi.getTimerCount()).toBe(1)
    await act(async () => { await session.reset(); session.ready(asset.id); session.ended(asset.id) })
    expect(vi.getTimerCount()).toBe(0)
    expect(session.connectedIDs.size).toBe(0)
    expect(session.connectionErrors).toEqual({})
  })

  it("advances the queue when readiness times out", async () => {
    const connect = vi.spyOn(api, "connectAsset").mockResolvedValue(ticket("ticket"))
    await act(async () => { session.open(asset); session.open(second) })
    await act(async () => vi.advanceTimersByTimeAsync(15_000))
    expect(connect).toHaveBeenCalledTimes(2)
    expect(session.connectingIDs.has(asset.id)).toBe(false)
    await act(async () => session.ready(second.id))
    expect(vi.getTimerCount()).toBe(0)
  })

  it("restores stored sessions when StrictMode replays mount effects", async () => {
    await act(async () => root.unmount())
    root = createRoot(host)
    saveSessions({ ids: [asset.id], active: asset.id, activity: { [asset.id]: Date.now() } })
    const connect = vi.spyOn(api, "connectAsset").mockResolvedValue(ticket("restored-ticket"))
    function Restore() {
      session = useSessions([asset], true, 60_000, "failed", "ended")
      return null
    }
    await act(async () => root.render(<StrictMode><Restore /></StrictMode>))
    expect(connect).toHaveBeenCalledTimes(1)
    expect(session.sessions).toEqual([asset.id])
    expect(session.connectionURLs[asset.id]).toBe("restored-ticket")
    await act(async () => session.ready(asset.id))
  })
})
