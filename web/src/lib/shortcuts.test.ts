import { describe, expect, it } from "vitest"

import { parseShortcut } from "./shortcuts"

describe("parseShortcut", () => {
  it("normalizes modifiers and named keys", () => {
    expect(parseShortcut("shift + control + t")).toEqual({ label: "Ctrl+Shift+T", keys: [0xffe3, 0xffe1, 0x74] })
    expect(parseShortcut("cmd+f12")).toEqual({ label: "Win+F12", keys: [0xffeb, 0xffc9] })
  })

  it("rejects invalid combinations", () => {
    expect(parseShortcut("")).toBeUndefined()
    expect(parseShortcut("Ctrl+T+V")).toBeUndefined()
    expect(parseShortcut("Ctrl+Alt")).toBeUndefined()
  })
})
