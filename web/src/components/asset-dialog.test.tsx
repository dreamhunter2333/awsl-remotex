// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import type { Asset } from "@/lib/api"
import { AssetButton } from "./asset-button"
import { AssetDialog } from "./asset-dialog"

vi.mock("@/lib/preferences", () => ({ usePreferences: () => ({ t: (key: string) => key }) }))
const asset: Asset = {
  id: "asset", name: "Asset", group: "", protocol: "ssh", host: "localhost", port: 22,
  username: "", credentialType: "prompt", credentialConfigured: false, createdAt: "", updatedAt: "",
}
let root: Root
let host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it("labels the dialog and displays deletion failures without closing it", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true)
  const onDelete = vi.fn().mockRejectedValue(new Error("delete failed"))
  const onClose = vi.fn()
  await act(async () => root.render(<AssetDialog asset={asset} open={false} onClose={onClose} onSubmit={vi.fn()} onDelete={onDelete} />))
  const dialog = host.querySelector("dialog")!
  expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)?.textContent).toBe("editAsset")
  const button = [...host.querySelectorAll("button")].find((item) => item.textContent === "deleteAsset")!
  await act(async () => button.click())
  expect(onDelete).toHaveBeenCalledWith(asset)
  expect(host.querySelector('[role="alert"]')?.textContent).toBe("delete failed")
  expect(button.disabled).toBe(false)
  expect(onClose).not.toHaveBeenCalled()
})

it("opens an asset with Enter without repeating a held key", async () => {
  const onConnect = vi.fn()
  await act(async () => root.render(<AssetButton asset={asset} active={false} selected={false} onClick={vi.fn()} onDoubleClick={onConnect} onEdit={vi.fn()} />))
  const button = host.querySelector("button")!
  await act(async () => {
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    button.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true }))
  })
  expect(onConnect).toHaveBeenCalledTimes(1)
})
