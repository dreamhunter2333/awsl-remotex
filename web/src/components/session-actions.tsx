import { useEffect, useRef, useState, type RefObject } from "react"
import { ChevronDown, Clipboard, Command, Keyboard, Maximize2, Minimize2, Plus, Power, RefreshCw, ScanLine, Settings2, Volume2, VolumeX, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { guacamoleKeys } from "@/lib/guacamole-keys"
import { usePreferences } from "@/lib/preferences"
import { loadCustomShortcuts, MAX_CUSTOM_SHORTCUTS, parseShortcut, saveCustomShortcuts, shortcutFromKeysyms, type Shortcut } from "@/lib/shortcuts"

const presetShortcuts: Shortcut[] = [
  { label: "Esc", keys: [guacamoleKeys.escape] },
  { label: "Tab", keys: [guacamoleKeys.tab] },
  { label: "Ctrl+C", keys: [guacamoleKeys.control, guacamoleKeys.c] },
  { label: "Ctrl+V", keys: [guacamoleKeys.control, guacamoleKeys.v] },
  { label: "Ctrl+Alt+Del", keys: [guacamoleKeys.control, guacamoleKeys.alt, guacamoleKeys.delete] },
  { label: "Ctrl+Shift+Esc", keys: [guacamoleKeys.control, guacamoleKeys.shift, guacamoleKeys.escape] },
  { label: "Alt+Tab", keys: [guacamoleKeys.alt, guacamoleKeys.tab] },
  { label: "Alt+F4", keys: [guacamoleKeys.alt, guacamoleKeys.f4] },
  { label: "Win", keys: [guacamoleKeys.super] },
  { label: "Win+L", keys: [guacamoleKeys.super, guacamoleKeys.l] },
]

const specialShortcuts: Shortcut[] = [
  { label: "CapsLock", keys: [guacamoleKeys.capsLock] },
  { label: "NumLock", keys: [guacamoleKeys.numLock] },
  { label: "ScrollLock", keys: [guacamoleKeys.scrollLock] },
  { label: "PrintScreen", keys: [guacamoleKeys.printScreen] },
  { label: "Pause", keys: [guacamoleKeys.pause] },
  { label: "Menu", keys: [guacamoleKeys.menu] },
]

interface SessionActionsProps {
  active: boolean
  connected: boolean
  connecting: boolean
  fullscreen: boolean
  audioEnabled: boolean
  showAudio: boolean
  onToggleAudio: () => void
  onClipboard: () => void
  onKeyboard: () => void
  onSendKeys: (keys: readonly number[]) => void
  onCaptureKeys: (onComplete: (keys: readonly number[]) => void) => (() => void) | undefined
  onReconnect: () => void
  onFullscreen: () => void
  onDisconnect: () => void
}

export function SessionActions({ active, connected, connecting, fullscreen, audioEnabled, showAudio, onToggleAudio, onClipboard, onKeyboard, onSendKeys, onCaptureKeys, onReconnect, onFullscreen, onDisconnect }: SessionActionsProps) {
  const { t } = usePreferences()
  const shortcutMenuRef = useRef<HTMLDetailsElement>(null)
  const actionMenuRef = useRef<HTMLDetailsElement>(null)
  const cancelCaptureRef = useRef<() => void>(undefined)
  const [shortcutInput, setShortcutInput] = useState("")
  const [shortcutError, setShortcutError] = useState("")
  const [customShortcuts, setCustomShortcuts] = useState<Shortcut[]>(loadCustomShortcuts)
  const customShortcutsRef = useRef(customShortcuts)
  const [capturing, setCapturing] = useState(false)
  customShortcutsRef.current = customShortcuts

  useEffect(() => () => cancelCaptureRef.current?.(), [])

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
  const storeShortcut = (shortcut: Shortcut) => {
    const current = customShortcutsRef.current
    if ([...presetShortcuts, ...specialShortcuts, ...current].some((item) => sameShortcut(item, shortcut))) {
      setShortcutError(t("shortcutExists"))
      return false
    }
    if (current.length >= MAX_CUSTOM_SHORTCUTS) {
      setShortcutError(t("shortcutLimit"))
      return false
    }
    const next = [...current, shortcut]
    customShortcutsRef.current = next
    setCustomShortcuts(next)
    saveCustomShortcuts(next)
    setShortcutError("")
    return true
  }
  const addShortcut = () => {
    const shortcut = parseShortcut(shortcutInput)
    if (!shortcut) {
      setShortcutError(t("invalidShortcut"))
      return
    }
    if (storeShortcut(shortcut)) setShortcutInput("")
  }
  const stopCapture = () => {
    cancelCaptureRef.current?.()
    cancelCaptureRef.current = undefined
    setCapturing(false)
  }
  const recordShortcut = () => {
    if (capturing) {
      stopCapture()
      return
    }
    setShortcutError("")
    const cancel = onCaptureKeys((keys) => {
      cancelCaptureRef.current = undefined
      setCapturing(false)
      const shortcut = shortcutFromKeysyms(keys)
      if (!shortcut) {
        setShortcutError(t("invalidShortcut"))
        return
      }
      storeShortcut(shortcut)
    })
    if (!cancel) {
      setShortcutError(t("shortcutCaptureUnavailable"))
      return
    }
    cancelCaptureRef.current = cancel
    setCapturing(true)
  }
  const removeShortcut = (label: string) => {
    const next = customShortcuts.filter((shortcut) => shortcut.label !== label)
    customShortcutsRef.current = next
    setCustomShortcuts(next)
    saveCustomShortcuts(next)
  }

  return (
    <div data-local-keyboard className="relative flex shrink-0 items-center gap-0.5 border-l border-[var(--border)] px-1">
      <Button className="touch-session-action order-1" variant="ghost" size="icon" disabled={!connected} onClick={onKeyboard} aria-label={t("keyboard")} title={t("keyboard")}><Keyboard className="size-3.5" /></Button>
      <Button className="order-2" variant="ghost" size="icon" disabled={!connected} onClick={onClipboard} aria-label={t("clipboard")} title={t("clipboard")}><Clipboard className="size-3.5" /></Button>
      {showAudio && (
        <Button className={audioEnabled ? "order-3 bg-[var(--accent-soft)] text-[var(--accent)]" : "order-3"} variant="ghost" size="icon" disabled={!active || connecting} onClick={onToggleAudio} aria-pressed={audioEnabled} aria-label={t(audioEnabled ? "disableAudio" : "enableAudio")} title={t(audioEnabled ? "disableAudio" : "enableAudio")}>
          {audioEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
        </Button>
      )}
      <div className="order-5 hidden items-center gap-0.5 @[520px]:flex">
        <Button variant="ghost" size="icon" disabled={!active || connecting} onClick={onReconnect} aria-label={t("reconnect")} title={t("reconnect")}><RefreshCw className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" disabled={!connected && !fullscreen} onClick={onFullscreen} aria-label={t(fullscreen ? "exitFullscreen" : "fullscreen")} title={t(fullscreen ? "exitFullscreen" : "fullscreen")}>{fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</Button>
        <Button className="ml-0.5 text-[var(--muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]" variant="ghost" size="icon" disabled={!active} onClick={onDisconnect} aria-label={t("disconnect")} title={t("disconnect")}><Power className="size-3.5" /></Button>
      </div>

      <details ref={shortcutMenuRef} className="order-4" onClick={(event) => { if (!connected) event.preventDefault() }} onToggle={() => {
        if (shortcutMenuRef.current?.open) closeMenu(actionMenuRef)
        else stopCapture()
      }}>
        <summary className="grid size-7 cursor-pointer list-none place-items-center rounded-md text-[var(--muted)] outline-none hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-[var(--muted)] [&::-webkit-details-marker]:hidden" aria-disabled={!connected} aria-label={t("shortcuts")} title={t("shortcuts")}><Command className="size-3.5" /></summary>
        <div className="absolute right-1 top-[calc(100%+4px)] z-50 max-h-[min(70dvh,420px)] w-56 overflow-y-auto rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-lg">
          <span className="block px-2 py-1 text-[10px] font-medium text-[var(--subtle)]">{t("shortcuts")}</span>
          <div className="grid grid-cols-2 gap-1">
            {presetShortcuts.map((shortcut) => (
              <button key={shortcut.label} type="button" disabled={!connected} onClick={() => runShortcut(shortcut.keys)} className="h-7 rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40">{shortcut.label}</button>
            ))}
          </div>
          <details className="group mt-1 border-t border-[var(--border)] pt-1">
            <summary className="flex h-7 cursor-pointer list-none items-center rounded-md px-2 text-[10px] font-medium text-[var(--subtle)] hover:bg-[var(--surface-hover)] [&::-webkit-details-marker]:hidden">{t("specialKeys")}<ChevronDown className="ml-auto size-3 transition-transform group-open:rotate-180" /></summary>
            <div className="grid grid-cols-2 gap-1 pt-1">
              {specialShortcuts.map((shortcut) => (
                <button key={shortcut.label} type="button" disabled={!connected} onClick={() => runShortcut(shortcut.keys)} className="h-7 truncate rounded-md border border-[var(--border)] px-1.5 text-[10px] text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40">{shortcut.label}</button>
              ))}
            </div>
          </details>
          {customShortcuts.length > 0 && (
            <div className="mt-1 space-y-1 border-t border-[var(--border)] pt-1">
              {customShortcuts.map((shortcut) => (
                <div key={shortcut.label} className="flex gap-1">
                  <button type="button" disabled={!connected} onClick={() => runShortcut(shortcut.keys)} className="h-7 min-w-0 flex-1 truncate rounded-md border border-[var(--border)] px-1.5 text-left text-[10px] text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40">{shortcut.label}</button>
                  <button type="button" onClick={() => removeShortcut(shortcut.label)} aria-label={t("deleteShortcut", { name: shortcut.label })} className="grid size-7 shrink-0 place-items-center rounded-md text-[var(--subtle)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"><X className="size-3" /></button>
                </div>
              ))}
            </div>
          )}
          <form className="mt-1 border-t border-[var(--border)] pt-1" onSubmit={(event) => { event.preventDefault(); addShortcut() }}>
            <span className="block px-1 py-1 text-[10px] font-medium text-[var(--subtle)]">{t("customShortcut")}</span>
            <div className="flex gap-1">
              <input value={shortcutInput} disabled={capturing} onChange={(event) => { setShortcutInput(event.target.value); setShortcutError("") }} placeholder={t("shortcutPlaceholder")} aria-label={t("customShortcut")} className="h-7 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--input)] px-2 text-[11px] outline-none focus:border-[var(--accent)] disabled:opacity-50" />
              <button type="button" disabled={!connected} aria-pressed={capturing} onClick={recordShortcut} aria-label={t(capturing ? "stopShortcutRecording" : "recordShortcut")} title={t(capturing ? "stopShortcutRecording" : "recordShortcut")} className={capturing ? "grid size-7 shrink-0 animate-pulse place-items-center rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "grid size-7 shrink-0 place-items-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:opacity-40"}><ScanLine className="size-3.5" /></button>
              <button type="submit" disabled={capturing} aria-label={t("addShortcut")} title={t("addShortcut")} className="grid size-7 shrink-0 place-items-center rounded-md border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] disabled:opacity-40"><Plus className="size-3.5" /></button>
            </div>
            <span className="block px-1 pt-1 text-[9px] leading-3.5 text-[var(--subtle)]">{t(capturing ? "pressShortcutKeys" : "shortcutFormatHint")}</span>
            {shortcutError && <span className="block px-1 pt-1 text-[10px] text-[var(--danger)]">{shortcutError}</span>}
          </form>
        </div>
      </details>

      <details ref={actionMenuRef} className="order-6 @[520px]:hidden" onToggle={() => {
        if (actionMenuRef.current?.open) closeMenu(shortcutMenuRef)
      }}>
        <summary className="grid size-7 cursor-pointer list-none place-items-center rounded-md text-[var(--muted)] outline-none hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden" aria-label={t("sessionActions")} title={t("sessionActions")}><Settings2 className="size-4" /></summary>
        <div className="absolute right-1 top-[calc(100%+4px)] z-50 min-w-32 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-lg">
          <button type="button" disabled={!connected} onClick={() => runAction(onClipboard)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40"><Clipboard className="size-3.5" />{t("clipboard")}</button>
          {showAudio && <button type="button" disabled={!active || connecting} aria-pressed={audioEnabled} onClick={() => runAction(onToggleAudio)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40">{audioEnabled ? <Volume2 className="size-3.5 text-[var(--accent)]" /> : <VolumeX className="size-3.5" />}{t(audioEnabled ? "disableAudio" : "enableAudio")}</button>}
          <button type="button" disabled={!active || connecting} onClick={() => runAction(onReconnect)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40"><RefreshCw className="size-3.5" />{t("reconnect")}</button>
          <button type="button" disabled={!connected && !fullscreen} onClick={() => runAction(onFullscreen)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40">{fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}{t(fullscreen ? "exitFullscreen" : "fullscreen")}</button>
          <button type="button" disabled={!active} onClick={() => runAction(onDisconnect)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-40"><Power className="size-3.5" />{t("disconnect")}</button>
        </div>
      </details>
    </div>
  )
}

function sameShortcut(left: Shortcut, right: Shortcut) {
  return left.label.toLowerCase() === right.label.toLowerCase()
    || (left.keys.length === right.keys.length && left.keys.every((keysym, index) => keysym === right.keys[index]))
}
