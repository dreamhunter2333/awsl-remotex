export const guacamoleKeys = {
  control: 0xffe3,
  alt: 0xffe9,
  shift: 0xffe1,
  delete: 0xffff,
  escape: 0xff1b,
  tab: 0xff09,
  capsLock: 0xffe5,
  numLock: 0xff7f,
  scrollLock: 0xff14,
  printScreen: 0xff61,
  pause: 0xff13,
  menu: 0xff67,
  super: 0xffeb,
  c: 0x0063,
  l: 0x006c,
  v: 0x0076,
  f4: 0xffc1,
} as const

export interface KeyEventSender {
  sendKeyEvent: (pressed: 0 | 1, keysym: number) => void
}

export function sendKeyCombination(sender: KeyEventSender | undefined, keys: readonly number[], holdMs = 0) {
  if (!sender || keys.length === 0) return false
  for (const keysym of keys) sender.sendKeyEvent(1, keysym)
  const release = () => {
    for (const keysym of [...keys].reverse()) sender.sendKeyEvent(0, keysym)
  }
  if (holdMs > 0) setTimeout(release, holdMs)
  else release()
  return true
}
