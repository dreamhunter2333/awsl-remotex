import { describe, expect, it, vi } from "vitest"

import { sendKeyCombination } from "./guacamole-keys"

describe("sendKeyCombination", () => {
  it("presses in order and releases in reverse order", () => {
    const sendKeyEvent = vi.fn()
    expect(sendKeyCombination({ sendKeyEvent }, [1, 2, 3])).toBe(true)
    expect(sendKeyEvent.mock.calls).toEqual([[1, 1], [1, 2], [1, 3], [0, 3], [0, 2], [0, 1]])
  })

  it("ignores missing clients and empty combinations", () => {
    expect(sendKeyCombination(undefined, [1])).toBe(false)
    expect(sendKeyCombination({ sendKeyEvent: vi.fn() }, [])).toBe(false)
  })

  it("can hold keys before releasing them", () => {
    vi.useFakeTimers()
    const sendKeyEvent = vi.fn()
    sendKeyCombination({ sendKeyEvent }, [0xffe5], 150)
    expect(sendKeyEvent.mock.calls).toEqual([[1, 0xffe5]])
    vi.advanceTimersByTime(149)
    expect(sendKeyEvent).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1)
    expect(sendKeyEvent.mock.calls).toEqual([[1, 0xffe5], [0, 0xffe5]])
    vi.useRealTimers()
  })
})
