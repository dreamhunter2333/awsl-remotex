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
  let key: { label: string; keysym: number } | undefined
  for (const token of tokens) {
    const modifier = modifiers[token]
    if (modifier) {
      modifierValues.set(modifier.keysym, modifier)
      continue
    }
    if (key) return undefined
    key = parseKey(token)
    if (!key) return undefined
  }

  const sortedModifiers = [...modifierValues.values()].sort((left, right) => left.order - right.order)
  if (!key && sortedModifiers.length !== 1) return undefined
  return {
    label: [...sortedModifiers.map((item) => item.label), ...(key ? [key.label] : [])].join("+"),
    keys: [...sortedModifiers.map((item) => item.keysym), ...(key ? [key.keysym] : [])],
  }
}

export function loadCustomShortcuts() {
  try {
    const values = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as unknown
    if (!Array.isArray(values)) return []
    return uniqueShortcuts(values.filter((value): value is string => typeof value === "string").map(parseShortcut).filter((value): value is Shortcut => Boolean(value)))
      .slice(0, MAX_CUSTOM_SHORTCUTS)
  } catch {
    return []
  }
}

export function saveCustomShortcuts(shortcuts: Shortcut[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts.map((shortcut) => shortcut.label)))
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
  return undefined
}

function uniqueShortcuts(shortcuts: Shortcut[]) {
  const seen = new Set<string>()
  return shortcuts.filter((shortcut) => {
    const key = shortcut.label.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
