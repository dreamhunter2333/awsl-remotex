import { beforeEach, describe, expect, it, vi } from "vitest"

describe("Guacamole SDK loader", () => {
  beforeEach(() => {
    vi.resetModules()
    Object.defineProperty(globalThis, "window", { configurable: true, value: {} })
  })

  it("removes a failed script and allows the next load to retry", async () => {
    const scripts: Array<{ onerror?: () => void; remove: ReturnType<typeof vi.fn> }> = []
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => {
          const script = { async: false, dataset: {}, remove: vi.fn() }
          scripts.push(script)
          return script
        },
        head: { appendChild: vi.fn() },
      },
    })
    const { loadGuacamoleSDK } = await import("./guacamole-sdk")

    const first = loadGuacamoleSDK()
    scripts[0].onerror?.()
    await expect(first).rejects.toThrow("Unable to load")
    expect(scripts[0].remove).toHaveBeenCalledOnce()

    const second = loadGuacamoleSDK()
    expect(scripts).toHaveLength(2)
    scripts[1].onerror?.()
    await expect(second).rejects.toThrow("Unable to load")
  })

  it("rejects and removes a loaded SDK with the wrong version", async () => {
    let script: { async: boolean; dataset: Record<string, string>; onload?: () => void; remove: ReturnType<typeof vi.fn> } | undefined
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        createElement: () => (script = { async: false, dataset: {}, remove: vi.fn() }),
        head: { appendChild: vi.fn() },
      },
    })
    const { loadGuacamoleSDK } = await import("./guacamole-sdk")

    const loading = loadGuacamoleSDK()
    window.Guacamole = { API_VERSION: "1.5.5" } as typeof window.Guacamole
    script?.onload?.()
    await expect(loading).rejects.toThrow("Expected Guacamole SDK 1.6.0")
    expect(script?.remove).toHaveBeenCalledOnce()
    expect(window.Guacamole).toBeUndefined()
  })
})
