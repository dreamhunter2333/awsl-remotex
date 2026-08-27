import { beforeEach, describe, expect, it } from "vitest"

import { loadSessions, saveSessions } from "./sessions"

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
