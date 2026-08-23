import { Monitor, Pencil, Server, SquareTerminal } from "lucide-react"

import type { Asset } from "@/lib/api"
import { protocolMeta } from "@/lib/assets"
import { usePreferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"

const protocolIcons = { ssh: SquareTerminal, rdp: Monitor, vnc: Server }

export function AssetButton({ asset, active, selected, onClick, onDoubleClick, onEdit }: {
  asset: Asset
  active: boolean
  selected: boolean
  onClick: () => void
  onDoubleClick: () => void
  onEdit: () => void
}) {
  const { t } = usePreferences()
  const meta = protocolMeta[asset.protocol]
  const Icon = protocolIcons[asset.protocol]

  return (
    <div
      className={cn(
        "group relative rounded-lg border border-transparent transition hover:bg-[var(--surface-hover)] focus-within:ring-2 focus-within:ring-[var(--accent)]",
        selected && !active && "bg-[var(--surface-hover)]",
        active && "border-[var(--border-strong)] bg-[var(--accent-soft)]",
      )}
    >
      <button type="button" onClick={onClick} onDoubleClick={onDoubleClick} title={t("doubleClickConnect")} className="grid w-full grid-cols-[32px_minmax(0,1fr)] items-center gap-2 rounded-lg px-1.5 py-1.5 pr-8 text-left outline-none">
        <span className={cn("grid size-7 place-items-center rounded-md", meta.color, meta.surface)}><Icon className="size-3.5" /></span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium text-[var(--foreground)]">{asset.name}</span>
          <span className="block truncate font-mono text-[10px] text-[var(--subtle)]">{asset.host}:{asset.port}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-[var(--muted)] opacity-55 outline-none transition-opacity hover:bg-[var(--surface)] hover:text-[var(--foreground)] group-hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--accent)] group-focus-within:opacity-100"
        aria-label={t("editAsset")}
        title={t("editAsset")}
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  )
}
