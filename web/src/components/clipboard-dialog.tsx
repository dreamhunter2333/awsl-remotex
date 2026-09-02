import { useEffect, useRef } from "react"
import { Clipboard, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { usePreferences } from "@/lib/preferences"

export function ClipboardDialog({ open, text, notification, onChange, onClose }: {
  open: boolean
  text: string
  notification?: { message: string; succeeded: boolean }
  onChange: (text: string) => void
  onClose: () => void
}) {
  const { t } = usePreferences()
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={dialogRef} onClose={onClose} className="m-auto w-[min(520px,calc(100%-2rem))] overflow-visible rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] p-0 text-[var(--foreground)] shadow-[0_24px_80px_var(--shadow)] backdrop:bg-[var(--backdrop)]">
      <div className="relative p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] text-[var(--accent)]"><Clipboard className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">{t("clipboard")}</h2>
            <p className="mt-0.5 text-[11px] leading-4 text-[var(--muted)]">{t("clipboardDescription")}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t("close")}><X className="size-4" /></Button>
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder={t("clipboardPlaceholder")}
          aria-label={t("clipboard")}
          className="min-h-48 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--input)] p-3 font-mono text-xs leading-5 text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] placeholder:text-[var(--subtle)]"
        />
        <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-[var(--subtle)]">
          <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[var(--green)]" />{t("clipboardLiveSync")}</span>
          <span className="font-mono tabular-nums">{t("clipboardCharacters", { count: text.length })}</span>
        </div>
        {notification && (
          <div role={notification.succeeded ? "status" : "alert"} className={`absolute left-1/2 top-[calc(100%+12px)] -translate-x-1/2 whitespace-nowrap rounded-lg border bg-[var(--surface)] px-3 py-2 text-xs shadow-lg ${notification.succeeded ? "border-[var(--green)] text-[var(--foreground)]" : "border-[var(--danger)] text-[var(--danger)]"}`}>
            {notification.message}
          </div>
        )}
      </div>
    </dialog>
  )
}
