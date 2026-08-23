import { useEffect, useMemo, useRef, useState } from "react"
import { LogOut, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from "lucide-react"

import { AssetButton } from "@/components/asset-button"
import { AssetDialog } from "@/components/asset-dialog"
import { LoadingScreen, LoginScreen } from "@/components/auth-screens"
import { PreferenceControls } from "@/components/preference-controls"
import { SessionActions, SessionViewport } from "@/components/session"
import { Button } from "@/components/ui/button"
import { api, type Asset, type AssetInput, type AuthStatus } from "@/lib/api"
import { displayGroup, protocolMeta } from "@/lib/assets"
import { usePreferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"

export default function App() {
  const { t } = usePreferences()
  const [authStatus, setAuthStatus] = useState<AuthStatus>()
  const [assets, setAssets] = useState<Asset[]>([])
  const [sessions, setSessions] = useState<string[]>([])
  const [activeSession, setActiveSession] = useState<string>()
  const [selectedAsset, setSelectedAsset] = useState<string>()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [connectionURLs, setConnectionURLs] = useState<Record<string, string>>({})
  const [connectionErrors, setConnectionErrors] = useState<Record<string, string>>({})
  const [connectingIDs, setConnectingIDs] = useState<Set<string>>(() => new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset>()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("awsl-remotex.sidebar") === "collapsed",
  )
  const [fullscreen, setFullscreen] = useState(false)
  const sessionLayoutRef = useRef<HTMLElement>(null)
  const connectingRef = useRef(new Set<string>())
  const connectionGenerationRef = useRef(new Map<string, number>())

  useEffect(() => {
    api
      .authStatus()
      .then(async (status) => {
        setAuthStatus(status)
        if (!status.authenticated) return
        setAssets(await api.listAssets())
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === sessionLayoutRef.current)
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  useEffect(() => {
    localStorage.setItem("awsl-remotex.sidebar", sidebarCollapsed ? "collapsed" : "expanded")
  }, [sidebarCollapsed])

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

  const activeAsset = assets.find((asset) => asset.id === activeSession)

  const setConnecting = (id: string, value: boolean) => {
    if (value) connectingRef.current.add(id)
    else connectingRef.current.delete(id)
    setConnectingIDs(new Set(connectingRef.current))
  }

  const connectSession = async (asset: Asset) => {
    if (connectingRef.current.has(asset.id)) return
    const generation = connectionGenerationRef.current.get(asset.id) ?? 0
    setConnecting(asset.id, true)
    setConnectionErrors((current) => ({ ...current, [asset.id]: "" }))
    try {
      const resolvedTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark"
      const ticket = await api.connectAsset(asset.id, resolvedTheme)
      if ((connectionGenerationRef.current.get(asset.id) ?? 0) !== generation) return
      localStorage.removeItem("GUAC_AUTH_TOKEN")
      localStorage.removeItem("GUAC_HISTORY")
      setConnectionURLs((current) => ({ ...current, [asset.id]: ticket.url }))
    } catch (reason) {
      if ((connectionGenerationRef.current.get(asset.id) ?? 0) !== generation) return
      const message = reason instanceof Error ? reason.message : t("connectionFailed")
      setConnectionErrors((current) => ({ ...current, [asset.id]: message }))
    } finally {
      setConnecting(asset.id, false)
    }
  }

  const openSession = (asset: Asset) => {
    setSelectedAsset(asset.id)
    setSessions((current) => current.includes(asset.id) ? current : [...current, asset.id])
    setActiveSession(asset.id)
    if (!connectionURLs[asset.id]) void connectSession(asset)
  }

  const closeSession = (id: string) => {
    connectionGenerationRef.current.set(id, (connectionGenerationRef.current.get(id) ?? 0) + 1)
    const index = sessions.indexOf(id)
    const nextSessions = sessions.filter((sessionID) => sessionID !== id)
    setSessions(nextSessions)
    setActiveSession((current) => current === id ? nextSessions[Math.min(index, nextSessions.length - 1)] : current)
    setConnectionURLs((current) => omitKey(current, id))
    setConnectionErrors((current) => omitKey(current, id))
  }

  const closeDialog = () => {
    setDialogOpen(false)
    setEditingAsset(undefined)
  }

  const saveAsset = async (input: AssetInput) => {
    const asset = editingAsset ? await api.updateAsset(editingAsset.id, input) : await api.createAsset(input)
    setAssets((current) => editingAsset
      ? current.map((item) => item.id === asset.id ? asset : item)
      : [...current, asset])
    closeDialog()
    if (!editingAsset) setSelectedAsset(asset.id)
  }

  const deleteAsset = async (asset: Asset) => {
    await api.deleteAsset(asset.id)
    closeSession(asset.id)
    setAssets((current) => current.filter((item) => item.id !== asset.id))
    setSelectedAsset((current) => current === asset.id ? undefined : current)
    closeDialog()
  }

  const openDialog = (asset?: Asset) => {
    setEditingAsset(asset)
    setDialogOpen(true)
  }

  const finishLogin = async () => {
    setAuthStatus({ required: true, authenticated: true })
    setLoading(true)
    setError("")
    try {
      setAssets(await api.listAssets())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("connectionFailed"))
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await api.logout()
    setSessions([])
    setAssets([])
    setConnectionURLs({})
    setConnectionErrors({})
    setAuthStatus({ required: true, authenticated: false })
  }

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await sessionLayoutRef.current?.requestFullscreen()
  }

  if (!authStatus) {
    return <LoadingScreen message={error || t("checkingAuthentication")} error={Boolean(error)} />
  }
  if (!authStatus.authenticated) {
    return <LoginScreen onAuthenticated={finishLogin} />
  }

  return (
    <div className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-3.5">
        <span className="min-w-0 truncate text-sm font-semibold tracking-[-0.025em]">Awsl RemoteX</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarCollapsed((value) => !value)}
          aria-label={sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
          title={sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
        <div className="min-w-0 flex-1" />
        <PreferenceControls />
        {authStatus.required && <Button variant="ghost" size="icon" onClick={logout} aria-label={t("logout")} title={t("logout")}><LogOut className="size-4" /></Button>}
      </header>

      <div className={cn(
        "grid min-h-0 flex-1 transition-[grid-template-columns] duration-200",
        sidebarCollapsed ? "grid-cols-[0_minmax(0,1fr)]" : "grid-cols-[260px_minmax(0,1fr)]",
      )}>
        <aside className={cn("flex min-w-0 flex-col overflow-hidden bg-[var(--panel)]", sidebarCollapsed ? "border-r-0" : "border-r border-[var(--border)]")}>
          <div className="flex h-11 shrink-0 items-center border-b border-[var(--border)] px-2.5">
            <label className="flex h-7.5 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--input)] px-2 transition focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
              <Search className="size-3.5 shrink-0 text-[var(--subtle)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-[var(--foreground)] outline-none placeholder:text-[var(--subtle)]"
                placeholder={t("filterConnections")}
                aria-label={t("filterConnections")}
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading && <p className="px-2 py-3 text-xs text-[var(--muted)]">{t("loadingAssets")}</p>}
            {error && <p className="px-2 py-3 text-xs text-[var(--danger)]">{error}</p>}
            {!loading && !error && groups.length === 0 && !sidebarCollapsed && <div className="px-2 py-8 text-center text-xs text-[var(--muted)]">{t("noAssets")}</div>}
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
                      active={activeSession === asset.id}
                      selected={selectedAsset === asset.id}
                      onClick={() => setSelectedAsset(asset.id)}
                      onDoubleClick={() => openSession(asset)}
                      onEdit={() => openDialog(asset)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="flex justify-start border-t border-[var(--border)] p-2">
            <Button variant="ghost" size="sm" onClick={() => openDialog()}><Plus className="size-4" />{t("addAsset")}</Button>
          </div>
        </aside>

        <main ref={sessionLayoutRef} className="@container flex min-w-0 flex-col bg-[var(--canvas)]">
          <div className="flex h-9 shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
            <div role="tablist" className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sessions.map((id) => {
                const asset = assets.find((item) => item.id === id)
                if (!asset) return null
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
                      aria-selected={isActive}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setActiveSession(id)}
                      className="grid h-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 px-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                    >
                      <span className={cn("font-mono text-[9px]", meta.color)}>{meta.label}</span>
                      <span className="truncate font-medium">{asset.name}</span>
                    </button>
                    <button type="button" aria-label={t("closeSession", { name: asset.name })} onClick={() => closeSession(id)} className="grid size-5 place-items-center rounded-md text-[var(--subtle)] outline-none hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><X className="size-3" /></button>
                  </div>
                )
              })}
            </div>
            <SessionActions
              active={Boolean(activeAsset)}
              fullscreen={fullscreen}
              onReconnect={() => activeAsset && connectSession(activeAsset)}
              onFullscreen={toggleFullscreen}
              onDisconnect={() => activeAsset && closeSession(activeAsset.id)}
            />
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--canvas)]">
            {sessions.map((id) => {
              const asset = assets.find((item) => item.id === id)
              if (!asset) return null
              return (
                <div key={id} className={cn("absolute inset-0", activeSession === id ? "visible z-10" : "invisible pointer-events-none")}>
                  <SessionViewport
                    active={activeSession === id}
                    asset={asset}
                    connectionURL={connectionURLs[id]}
                    connectionError={connectionErrors[id]}
                    connecting={connectingIDs.has(id)}
                    onReconnect={() => connectSession(asset)}
                    onSessionEnded={() => closeSession(id)}
                  />
                </div>
              )
            })}
          </div>
        </main>
      </div>

      <AssetDialog key={editingAsset?.id ?? "new"} asset={editingAsset} open={dialogOpen} onClose={closeDialog} onSubmit={saveAsset} onDelete={deleteAsset} />
    </div>
  )
}

function omitKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}
