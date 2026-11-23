// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { Asset, ConnectionTicket } from "@/lib/api"
import { SessionViewport } from "./session"

const { connect, disconnect, dispose } = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  dispose: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/guacamole-session", () => ({
  GuacamoleSession: class {
    connect = connect
    disconnect = disconnect
    dispose = dispose
  },
}))
vi.mock("@/lib/preferences", () => ({ usePreferences: () => ({ t: (key: string) => key }) }))

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

it("preserves a live connection on edit and uses the protocol from each ticket", async () => {
  const asset: Asset = {
    id: "asset", name: "Before", group: "", protocol: "ssh", host: "localhost", port: 22,
    username: "", credentialType: "prompt", credentialConfigured: false, createdAt: "", updatedAt: "",
  }
  const connection: ConnectionTicket = { url: "old-ticket", expiresAt: "", protocol: "ssh" }
  const props = {
    active: true, connecting: false, asset, connection,
    onReconnect: vi.fn(), onSessionEnded: vi.fn(), onReady: vi.fn(), onActivity: vi.fn(),
    onAudioChanged: vi.fn(), onClipboard: vi.fn(),
  }
  await act(async () => root.render(<SessionViewport {...props} />))
  expect(connect).toHaveBeenCalledWith("Before", "old-ticket", false)
  const edited: Asset = { ...asset, name: "After", protocol: "vnc" }
  await act(async () => root.render(<SessionViewport {...props} asset={edited} />))
  expect(connect).toHaveBeenCalledTimes(1)
  expect(disconnect).not.toHaveBeenCalled()
  const fresh: ConnectionTicket = { url: "fresh-ticket", expiresAt: "", protocol: "rdp" }
  await act(async () => root.render(<SessionViewport {...props} asset={edited} connection={fresh} />))
  expect(connect).toHaveBeenCalledTimes(2)
  expect(connect).toHaveBeenLastCalledWith("After", "fresh-ticket", true)
  expect(disconnect).toHaveBeenCalledTimes(1)
})
