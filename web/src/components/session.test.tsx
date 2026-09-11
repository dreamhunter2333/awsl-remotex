// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { Asset } from "@/lib/api"
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

it("preserves a live connection on rename and uses the new name only with a fresh ticket", async () => {
  const asset: Asset = {
    id: "asset", name: "Before", group: "", protocol: "ssh", host: "localhost", port: 22,
    username: "", credentialType: "prompt", credentialConfigured: false, createdAt: "", updatedAt: "",
  }
  const props = {
    active: true, connecting: false, asset, connectionURL: "old-ticket",
    onReconnect: vi.fn(), onSessionEnded: vi.fn(), onReady: vi.fn(), onActivity: vi.fn(),
    onAudioCapability: vi.fn(), onClipboard: vi.fn(),
  }
  await act(async () => root.render(<SessionViewport {...props} />))
  expect(connect).toHaveBeenCalledWith("Before", "old-ticket")
  const renamed = { ...asset, name: "After" }
  await act(async () => root.render(<SessionViewport {...props} asset={renamed} />))
  expect(connect).toHaveBeenCalledTimes(1)
  expect(disconnect).not.toHaveBeenCalled()
  await act(async () => root.render(<SessionViewport {...props} asset={renamed} connectionURL="fresh-ticket" />))
  expect(connect).toHaveBeenCalledTimes(2)
  expect(connect).toHaveBeenLastCalledWith("After", "fresh-ticket")
  expect(disconnect).toHaveBeenCalledTimes(1)
})
