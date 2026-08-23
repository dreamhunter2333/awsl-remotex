import { useRef, useState, type RefObject } from "react"
import { Command, Keyboard, Maximize2, Minimize2, Plus, Power, RefreshCw, Settings2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { guacamoleKeys } from "@/lib/guacamole-keys"
import { usePreferences } from "@/lib/preferences"
import { loadCustomShortcuts, MAX_CUSTOM_SHORTCUTS, parseShortcut, saveCustomShortcuts, type Shortcut } from "@/lib/shortcuts"

const presetShortcuts: Shortcut[] = [
  { label: "Esc", keys: [guacamoleKeys.escape] },
  { label: "Tab", keys: [guacamoleKeys.tab] },
  { label: "Ctrl+C", keys: [guacamoleKeys.control, guacamoleKeys.c] },
  { label: "Ctrl+V", keys: [guacamoleKeys.control, guacamoleKeys.v] },
  { label: "Ctrl+Alt+Del", keys: [guacamoleKeys.control, guacamoleKeys.alt, guacamoleKeys.delete] },
  { label: "Win", keys: [guacamoleKeys.super] },
]

interface SessionActionsProps {
  active: boolean
  fullscreen: boolean
  onKeyboard: () => void
  onSendKeys: (keys: readonly number[]) => void
  onReconnect: () => void
  onFullscreen: () => void
  onDisconnect: () => void
}

export function SessionActions({ active, fullscreen, onKeyboard, onSendKeys, onReconnect, onFullscreen, onDisconnect }: SessionActionsProps) {
  const { t } = usePreferences()
  const shortcutMenuRef = useRef<HTMLDetailsElement>(null)
  const actionMenuRef = useRef<HTMLDetailsElement>(null)
  const [shortcutInput, setShortcutInput] = useState("")
  const [shortcutError, setShortcutError] = useState("")
  const [customShortcuts, setCustomShortcuts] = useState<Shortcut[]>(loadCustomShortcuts)

  const closeMenu = (menu: RefObject<HTMLDetailsElement | null>) => {
    if (menu.current) menu.current.open = false
  }
  const runAction = (action: () => void) => {
    action()
    closeMenu(actionMenuRef)
  }
  const runShortcut = (keys: readonly number[]) => {
    onSendKeys(keys)
    closeMenu(shortcutMenuRef)
  }
  const addShortcut = () => {
    const shortcut = parseShortcut(shortcutInput)
    if (!shortcut) {
      setShortcutError(t("invalidShortcut"))
      return
    }
    if ([...presetShortcuts, ...customShortcuts].some((item) => item.label.toLowerCase() === shortcut.label.toLowerCase())) {
      setShortcutError(t("shortcutExists"))
      return
    }
    if (customShortcuts.length >= MAX_CUSTOM_SHORTCUTS) {
      setShortcutError(t("shortcutLimit"))
      return
    }
    const next = [...customShortcuts, shortcut]
    setCustomShortcuts(next)
    saveCustomShortcuts(next)
    setShortcutInput("")
    setShortcutError("")
  }
  const removeShortcut = (label: string) => {
    const next = customShortcuts.filter((shortcut) => shortcut.label !== label)
    setCustomShortcuts(next)
    saveCustomShortcuts(next)
  }

  return (
    <div className="relative flex shrink-0 items-center border-l border-[var(--border)] px-1">
      <Button className="touch-session-action" variant="ghost" size="icon" disabled={!active} onClick={onKeyboard} aria-label={t("keyboard")} title={t("keyboard")}><Keyboard className="size-4" /></Button>
      <div className="hidden items-center gap-0.5 @[520px]:flex">
        <Button variant="ghost" size="icon" disabled={!active} onClick={onReconnect} aria-label={t("reconnect")} title={t("reconnect")}><RefreshCw className="size-4" /></Button>
        <Button variant="ghost" size="icon" disabled={!active} onClick={onFullscreen} aria-label={t(fullscreen ? "exitFullscreen" : "fullscreen")} title={t(fullscreen ? "exitFullscreen" : "fullscreen")}>{fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
        <Button variant="danger" size="icon" disabled={!active} onClick={onDisconnect} aria-label={t("disconnect")} title={t("disconnect")}><Power className="size-4" /></Button>
      </div>

      <details ref={shortcutMenuRef} onToggle={() => {
        if (shortcutMenuRef.current?.open) closeMenu(actionMenuRef)
      }}>
        <summary className="grid size-7 cursor-pointer list-none place-items-center rounded-md text-[var(--muted)] outline-none hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden" aria-label={t("shortcuts")} title={t("shortcuts")}><Command className="size-4" /></summary>
        <div className="absolute right-1 top-[calc(100%+4px)] z-50 max-h-[min(70dvh,420px)] w-56 overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-lg">
          <span className="block px-2 py-1 text-[10px] font-medium text-[var(--subtle)]">{t("shortcuts")}</span>
          <div className="grid grid-cols-2 gap-1">
            {presetShortcuts.map((shortcut) => (
              <button key={shortcut.label} type="button" disabled={!active} onClick={() => runShortcut(shortcut.keys)} className="h-7 rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40">{shortcut.label}</button>
            ))}
          </div>
          {customShortcuts.length > 0 && (
            <div className="mt-1 space-y-1 border-t border-[var(--border)] pt-1">
              {customShortcuts.map((shortcut) => (
                <div key={shortcut.label} className="flex gap-1">
                  <button type="button" disabled={!active} onClick={() => runShortcut(shortcut.keys)} className="h-7 min-w-0 flex-1 truncate rounded-md border border-[var(--border)] px-1.5 text-left text-[10px] text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40">{shortcut.label}</button>
                  <button type="button" onClick={() => removeShortcut(shortcut.label)} aria-label={t("deleteShortcut", { name: shortcut.label })} className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--subtle)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"><X className="size-3" /></button>
                </div>
              ))}
            </div>
          )}
          <form className="mt-1 border-t border-[var(--border)] pt-1" onSubmit={(event) => { event.preventDefault(); addShortcut() }}>
            <span className="block px-1 py-1 text-[10px] font-medium text-[var(--subtle)]">{t("customShortcut")}</span>
            <div className="flex gap-1">
              <input value={shortcutInput} onChange={(event) => { setShortcutInput(event.target.value); setShortcutError("") }} placeholder={t("shortcutPlaceholder")} aria-label={t("customShortcut")} className="h-7 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--input)] px-2 text-[11px] outline-none focus:border-[var(--accent)]" />
              <button type="submit" aria-label={t("addShortcut")} title={t("addShortcut")} className="grid size-7 shrink-0 place-items-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"><Plus className="size-3.5" /></button>
            </div>
            {shortcutError && <span className="block px-1 pt-1 text-[10px] text-[var(--danger)]">{shortcutError}</span>}
          </form>
        </div>
      </details>

      <details ref={actionMenuRef} className="@[520px]:hidden" onToggle={() => {
        if (actionMenuRef.current?.open) closeMenu(shortcutMenuRef)
      }}>
        <summary className="grid size-7 cursor-pointer list-none place-items-center rounded-md text-[var(--muted)] outline-none hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden" aria-label={t("sessionActions")} title={t("sessionActions")}><Settings2 className="size-4" /></summary>
        <div className="absolute right-1 top-[calc(100%+4px)] z-50 min-w-32 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-lg">
          <button type="button" disabled={!active} onClick={() => runAction(onReconnect)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40"><RefreshCw className="size-3.5" />{t("reconnect")}</button>
          <button type="button" disabled={!active} onClick={() => runAction(onFullscreen)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40">{fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}{t(fullscreen ? "exitFullscreen" : "fullscreen")}</button>
          <button type="button" disabled={!active} onClick={() => runAction(onDisconnect)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-40"><Power className="size-3.5" />{t("disconnect")}</button>
        </div>
      </details>
    </div>
  )
}
