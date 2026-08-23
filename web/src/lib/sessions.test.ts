import { beforeEach, describe, expect, it } from "vitest"

import { loadSessions, prepareGuacamoleStorage, saveSessions } from "./sessions"

describe("session storage", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage() })
  })

  it("restores unique sessions and the active tab", () => {
    saveSessions({ ids: ["one", "two", "one"], active: "two", activity: { one: 1, two: 2 } })
    expect(loadSessions()).toEqual({ ids: ["one", "two"], active: "two", activity: { one: 1, two: 2 } })
  })

  it("falls back safely when stored data is invalid", () => {
    localStorage.setItem("awsl-remotex.sessions", "{")
    expect(loadSessions()).toEqual({ ids: [], activity: {} })
  })

  it("keeps Guacamole preferences while selecting touchpad mode", () => {
    localStorage.setItem("GUAC_AUTH_TOKEN", "token")
    localStorage.setItem("GUAC_HISTORY", "history")
    localStorage.setItem("GUAC_PREFERENCES", JSON.stringify({ language: "zh_CN", emulateAbsoluteMouse: true }))
    prepareGuacamoleStorage()
    expect(localStorage.getItem("GUAC_AUTH_TOKEN")).toBeNull()
    expect(localStorage.getItem("GUAC_HISTORY")).toBeNull()
    expect(JSON.parse(localStorage.getItem("GUAC_PREFERENCES") || "{}")).toEqual({ language: "zh_CN", emulateAbsoluteMouse: false })
  })
})

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}
