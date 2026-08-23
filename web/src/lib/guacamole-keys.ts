export const guacamoleKeys = {
  control: 0xffe3,
  alt: 0xffe9,
  shift: 0xffe1,
  delete: 0xffff,
  escape: 0xff1b,
  tab: 0xff09,
  super: 0xffeb,
  c: 0x0063,
  v: 0x0076,
} as const

export interface KeyEventSender {
  sendKeyEvent: (pressed: 0 | 1, keysym: number) => void
}

export function sendKeyCombination(sender: KeyEventSender | undefined, keys: readonly number[]) {
  if (!sender || keys.length === 0) return false
  for (const keysym of keys) sender.sendKeyEvent(1, keysym)
  for (const keysym of [...keys].reverse()) sender.sendKeyEvent(0, keysym)
  return true
}
