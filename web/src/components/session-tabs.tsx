import { X } from "lucide-react"

import type { Asset } from "@/lib/api"
import { protocolMeta } from "@/lib/assets"
import { usePreferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"

interface SessionTabsProps {
  assets: Asset[]
  activeSession?: string
  onActivate: (id: string) => void
  onClose: (id: string) => void
}

export function SessionTabs({ assets, activeSession, onActivate, onClose }: SessionTabsProps) {
  const { t } = usePreferences()
  return (
    <div role="tablist" data-local-keyboard className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {assets.map((asset, index) => {
        const { id } = asset
        const meta = protocolMeta[asset.protocol]
        const isActive = activeSession === id
        return (
          <div key={id} className={cn(
            "group grid h-9 min-w-[132px] max-w-[190px] grid-cols-[minmax(0,1fr)_24px] items-center border-r border-b-2 border-[var(--border)] text-[11px] text-[var(--muted)] transition hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
            isActive ? "border-b-[var(--accent)] bg-[var(--background)] text-[var(--foreground)]" : "border-b-transparent",
          )}>
            <button
              type="button"
              role="tab"
              id={`session-tab-${id}`}
              aria-controls={`session-panel-${id}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(event) => {
                const last = assets.length - 1
                const next = event.key === "Home" ? 0 : event.key === "End" ? last
                  : event.key === "ArrowLeft" ? (index + last) % (last + 1)
                  : event.key === "ArrowRight" ? (index + 1) % (last + 1) : undefined
                if (next === undefined) return
                event.preventDefault()
                const nextID = assets[next].id
                onActivate(nextID)
                document.getElementById(`session-tab-${nextID}`)?.focus()
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onActivate(id)}
              className="grid h-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 px-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
            >
              <span className={cn("font-mono text-[9px]", meta.color)}>{meta.label}</span>
              <span className="truncate font-medium">{asset.name}</span>
            </button>
            <button type="button" aria-label={t("closeSession", { name: asset.name })} onClick={() => onClose(id)} className="grid size-5 place-items-center rounded-md text-[var(--subtle)] outline-none hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><X className="size-3" /></button>
          </div>
        )
      })}
    </div>
  )
}
