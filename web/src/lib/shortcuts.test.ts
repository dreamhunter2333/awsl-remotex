import { describe, expect, it } from "vitest"

import { parseShortcut, shortcutFromKeysyms } from "./shortcuts"

describe("parseShortcut", () => {
  it("normalizes modifiers and named keys", () => {
    expect(parseShortcut("shift + control + t")).toEqual({ label: "Ctrl+Shift+T", keys: [0xffe3, 0xffe1, 0x74] })
    expect(parseShortcut("cmd+f12")).toEqual({ label: "Win+F12", keys: [0xffeb, 0xffc9] })
    expect(parseShortcut("Caps Lock")).toEqual({ label: "CapsLock", keys: [0xffe5] })
    expect(parseShortcut("Ctrl+0x1008ff13")).toEqual({ label: "Ctrl+0x1008FF13", keys: [0xffe3, 0x1008ff13] })
    expect(shortcutFromKeysyms([0xffe9, 0xff09])).toEqual({ label: "Alt+Tab", keys: [0xffe9, 0xff09] })
  })

  it("rejects invalid combinations", () => {
    expect(parseShortcut("")).toBeUndefined()
    expect(parseShortcut("Ctrl+NotAKey")).toBeUndefined()
    expect(parseShortcut("0xFFFFFFFF")).toBeUndefined()
  })

  it("accepts arbitrary multi-key combinations", () => {
    expect(parseShortcut("Ctrl+T+V")).toEqual({ label: "Ctrl+T+V", keys: [0xffe3, 0x74, 0x76] })
    expect(parseShortcut("Ctrl+Alt")).toEqual({ label: "Ctrl+Alt", keys: [0xffe3, 0xffe9] })
  })
})
