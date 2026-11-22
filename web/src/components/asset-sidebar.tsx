import { useMemo, useState } from "react"
import { Plus, Search } from "lucide-react"

import { AssetButton } from "@/components/asset-button"
import { Button } from "@/components/ui/button"
import type { Asset } from "@/lib/api"
import { displayGroup } from "@/lib/assets"
import { usePreferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"

interface AssetSidebarProps {
  assets: Asset[]
  activeAssetId?: string
  selectedAsset?: string
  collapsed: boolean
  loading: boolean
  error: string
  onAdd: () => void
  onEdit: (asset: Asset) => void
  onSelect: (id: string) => void
  onConnect: (asset: Asset) => void
}

export function AssetSidebar({
  assets, activeAssetId, selectedAsset, collapsed, loading, error, onAdd, onEdit, onSelect, onConnect,
}: AssetSidebarProps) {
  const { t } = usePreferences()
  const [query, setQuery] = useState("")
  const groups = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const visibleAssets = normalized
      ? assets.filter((asset) => `${asset.name} ${asset.host} ${asset.group} ${asset.protocol}`.toLowerCase().includes(normalized))
      : assets
    const result = new Map<string, Asset[]>()
    for (const asset of visibleAssets) {
      const group = result.get(asset.group) ?? []
      group.push(asset)
      result.set(asset.group, group)
    }
    return [...result.entries()]
  }, [assets, query])

  return (
    <aside id="asset-sidebar" inert={collapsed} data-local-keyboard className={cn(
      "absolute inset-y-0 left-0 z-30 flex w-[min(280px,85vw)] min-w-0 flex-col overflow-hidden bg-[var(--panel)] shadow-xl transition-transform duration-200 sm:static sm:w-auto sm:shadow-none",
      collapsed ? "-translate-x-full border-r-0 sm:translate-x-0" : "translate-x-0 border-r border-[var(--border)]",
    )}>
      <div className="flex h-11 shrink-0 items-center border-b border-[var(--border)] px-2.5">
        <label className="flex h-7.5 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--input)] px-2 transition focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
          <Search className="size-3.5 shrink-0 text-[var(--subtle)]" />
          <input
            data-local-keyboard
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--foreground)] outline-none placeholder:text-[var(--subtle)]"
            placeholder={t("filterConnections")}
            aria-label={t("filterConnections")}
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && <p className="px-2 py-3 text-xs text-[var(--muted)]">{t("loadingAssets")}</p>}
        {error && <p className="px-2 py-3 text-xs text-[var(--danger)]">{error}</p>}
        {!loading && !error && groups.length === 0 && !collapsed && <div className="px-2 py-8 text-center text-xs text-[var(--muted)]">{t("noAssets")}</div>}
        {groups.map(([group, groupAssets]) => (
          <section key={group} className="mb-4">
            <div className="mb-1 flex h-6 items-center justify-between px-2 text-[10px] font-semibold tracking-wide text-[var(--subtle)]">
              <span>{displayGroup(group, t("defaultGroup"))}</span>
              <span>{groupAssets.length}</span>
            </div>
            <div className="space-y-0.5">
              {groupAssets.map((asset) => (
                <AssetButton
                  key={asset.id}
                  asset={asset}
                  active={activeAssetId === asset.id}
                  selected={selectedAsset === asset.id}
                  onClick={() => onSelect(asset.id)}
                  onDoubleClick={() => onConnect(asset)}
                  onEdit={() => onEdit(asset)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="flex justify-start border-t border-[var(--border)] p-2">
        <Button variant="ghost" size="sm" onClick={onAdd}><Plus className="size-3.5" />{t("addAsset")}</Button>
      </div>
    </aside>
  )
}
