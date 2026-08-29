import { guacamoleKeys } from "./guacamole-keys"

const STORAGE_KEY = "awsl-remotex.shortcuts"
export const MAX_CUSTOM_SHORTCUTS = 12

export interface Shortcut {
  label: string
  keys: number[]
}

const modifiers: Record<string, { label: string; keysym: number; order: number }> = {
  ctrl: { label: "Ctrl", keysym: guacamoleKeys.control, order: 0 },
  control: { label: "Ctrl", keysym: guacamoleKeys.control, order: 0 },
  alt: { label: "Alt", keysym: guacamoleKeys.alt, order: 1 },
  option: { label: "Alt", keysym: guacamoleKeys.alt, order: 1 },
  shift: { label: "Shift", keysym: guacamoleKeys.shift, order: 2 },
  win: { label: "Win", keysym: guacamoleKeys.super, order: 3 },
  meta: { label: "Win", keysym: guacamoleKeys.super, order: 3 },
  super: { label: "Win", keysym: guacamoleKeys.super, order: 3 },
  cmd: { label: "Win", keysym: guacamoleKeys.super, order: 3 },
  command: { label: "Win", keysym: guacamoleKeys.super, order: 3 },
}

const namedKeys: Record<string, { label: string; keysym: number }> = {
  esc: { label: "Esc", keysym: 0xff1b },
  escape: { label: "Esc", keysym: 0xff1b },
  tab: { label: "Tab", keysym: 0xff09 },
  enter: { label: "Enter", keysym: 0xff0d },
  return: { label: "Enter", keysym: 0xff0d },
  backspace: { label: "Backspace", keysym: 0xff08 },
  capslock: { label: "CapsLock", keysym: guacamoleKeys.capsLock },
  "caps lock": { label: "CapsLock", keysym: guacamoleKeys.capsLock },
  numlock: { label: "NumLock", keysym: guacamoleKeys.numLock },
  "num lock": { label: "NumLock", keysym: guacamoleKeys.numLock },
  scrolllock: { label: "ScrollLock", keysym: guacamoleKeys.scrollLock },
  "scroll lock": { label: "ScrollLock", keysym: guacamoleKeys.scrollLock },
  printscreen: { label: "PrintScreen", keysym: guacamoleKeys.printScreen },
  "print screen": { label: "PrintScreen", keysym: guacamoleKeys.printScreen },
  prtsc: { label: "PrintScreen", keysym: guacamoleKeys.printScreen },
  pause: { label: "Pause", keysym: guacamoleKeys.pause },
  menu: { label: "Menu", keysym: guacamoleKeys.menu },
  delete: { label: "Delete", keysym: 0xffff },
  del: { label: "Delete", keysym: 0xffff },
  insert: { label: "Insert", keysym: 0xff63 },
  home: { label: "Home", keysym: 0xff50 },
  end: { label: "End", keysym: 0xff57 },
  pageup: { label: "PageUp", keysym: 0xff55 },
  pagedown: { label: "PageDown", keysym: 0xff56 },
  left: { label: "Left", keysym: 0xff51 },
  up: { label: "Up", keysym: 0xff52 },
  right: { label: "Right", keysym: 0xff53 },
  down: { label: "Down", keysym: 0xff54 },
  space: { label: "Space", keysym: 0x0020 },
}

export function parseShortcut(value: string): Shortcut | undefined {
  const tokens = value.split("+").map((token) => token.trim().toLowerCase()).filter(Boolean)
  if (tokens.length === 0) return undefined

  const modifierValues = new Map<number, { label: string; keysym: number; order: number }>()
  const keys: Array<{ label: string; keysym: number }> = []
  for (const token of tokens) {
    const modifier = modifiers[token]
    if (modifier) {
      modifierValues.set(modifier.keysym, modifier)
      continue
    }
    const key = parseKey(token)
    if (!key) return undefined
    keys.push(key)
  }

  const sortedModifiers = [...modifierValues.values()].sort((left, right) => left.order - right.order)
  const values = [...sortedModifiers, ...keys].filter((item, index, items) => items.findIndex((candidate) => candidate.keysym === item.keysym) === index)
  if (values.length === 0) return undefined
  return {
    label: values.map((item) => item.label).join("+"),
    keys: values.map((item) => item.keysym),
  }
}

export function loadCustomShortcuts() {
  try {
    const values = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as unknown
    if (!Array.isArray(values)) return []
    return uniqueShortcuts(values.map(readStoredShortcut).filter((value): value is Shortcut => Boolean(value)))
      .slice(0, MAX_CUSTOM_SHORTCUTS)
  } catch {
    return []
  }
}

export function saveCustomShortcuts(shortcuts: Shortcut[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts))
  } catch {
    return
  }
}

function parseKey(token: string) {
  if (namedKeys[token]) return namedKeys[token]
  const functionKey = /^f([1-9]|1[0-2])$/.exec(token)
  if (functionKey) {
    const number = Number(functionKey[1])
    return { label: `F${number}`, keysym: 0xffbd + number }
  }
  if (/^[a-z0-9]$/.test(token)) return { label: token.toUpperCase(), keysym: token.charCodeAt(0) }
  const rawKeysym = /^0x([0-9a-f]{1,8})$/.exec(token)
  if (rawKeysym) {
    const keysym = Number.parseInt(rawKeysym[1], 16)
    if (!isKeysym(keysym)) return undefined
    return { label: formatKeysym(keysym), keysym }
  }
  return undefined
}

export function shortcutFromKeysyms(keys: readonly number[]): Shortcut | undefined {
  if (keys.length === 0 || keys.some((keysym) => !isKeysym(keysym))) return undefined
  const uniqueKeys = [...new Set(keys)]
  return { label: uniqueKeys.map(formatKeysym).join("+"), keys: uniqueKeys }
}

function formatKeysym(keysym: number) {
  const modifier = [...Object.values(modifiers), ...Object.values(namedKeys)].find((item) => item.keysym === keysym)
  if (modifier) return modifier.label
  if (keysym >= 0xffbe && keysym <= 0xffd5) return `F${keysym - 0xffbd}`
  if (keysym >= 0x21 && keysym <= 0x7e) return String.fromCodePoint(keysym).toUpperCase()
  const codepoint = keysym & 0x00ffffff
  if ((keysym & 0xff000000) === 0x01000000 && codepoint <= 0x10ffff) return String.fromCodePoint(codepoint)
  return `0x${keysym.toString(16).toUpperCase().padStart(4, "0")}`
}

function readStoredShortcut(value: unknown) {
  if (typeof value === "string") return parseShortcut(value)
  if (!value || typeof value !== "object") return
  const shortcut = value as Partial<Shortcut>
  if (typeof shortcut.label !== "string" || shortcut.label.trim() === "" || !Array.isArray(shortcut.keys) || shortcut.keys.length === 0) return
  if (shortcut.keys.some((keysym) => !isKeysym(keysym))) return
  return { label: shortcut.label.trim(), keys: shortcut.keys }
}

function isKeysym(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 0x1fffffff
}

function uniqueShortcuts(shortcuts: Shortcut[]) {
  const seen = new Set<string>()
  return shortcuts.filter((shortcut) => {
    const key = shortcut.keys.join(",")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
