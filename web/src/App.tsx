import { useEffect, useMemo, useRef, useState } from "react"
import { LogOut, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from "lucide-react"

import { AssetButton } from "@/components/asset-button"
import { AssetDialog } from "@/components/asset-dialog"
import { LoadingScreen, LoginScreen } from "@/components/auth-screens"
import { PreferenceControls } from "@/components/preference-controls"
import { SessionActions } from "@/components/session-actions"
import { SessionViewport } from "@/components/session"
import { Button } from "@/components/ui/button"
import { api, type Asset, type AssetInput, type AuthStatus } from "@/lib/api"
import { displayGroup, protocolMeta } from "@/lib/assets"
import { usePreferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"
import { useSessions } from "@/hooks/use-sessions"
import { usePWAUpdate } from "@/hooks/use-pwa-update"

export default function App() {
  const { t } = usePreferences()
  const [authStatus, setAuthStatus] = useState<AuthStatus>()
  const [assets, setAssets] = useState<Asset[]>([])
  const [selectedAsset, setSelectedAsset] = useState<string>()
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset>()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("awsl-remotex.sidebar") === "collapsed" || (localStorage.getItem("awsl-remotex.sidebar") === null && window.matchMedia("(max-width: 639px)").matches),
  )
  const [fullscreen, setFullscreen] = useState(false)
  const sessionLayoutRef = useRef<HTMLElement>(null)
  const session = useSessions(
    assets,
    Boolean(authStatus?.authenticated && !loading),
    (authStatus?.sessionIdleSeconds ?? 86_400) * 1_000,
    t("connectionFailed"),
    t("sessionEnded"),
  )
  const pwa = usePWAUpdate()

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

  const activeAsset = assets.find((asset) => asset.id === session.activeSession)

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
    session.close(asset.id)
    setAssets((current) => current.filter((item) => item.id !== asset.id))
    setSelectedAsset((current) => current === asset.id ? undefined : current)
    closeDialog()
  }

  const openDialog = (asset?: Asset) => {
    setEditingAsset(asset)
    setDialogOpen(true)
  }

  const finishLogin = async () => {
    setLoading(true)
    setError("")
    try {
      setAuthStatus(await api.authStatus())
      setAssets(await api.listAssets())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("connectionFailed"))
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await api.logout()
    session.reset()
    setAssets([])
    setAuthStatus({ required: true, authenticated: false, sessionIdleSeconds: authStatus?.sessionIdleSeconds ?? 86_400 })
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
    <div className="app-shell flex h-dvh flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
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
        "relative grid min-h-0 flex-1 grid-cols-[0_minmax(0,1fr)] transition-[grid-template-columns] duration-200",
        !sidebarCollapsed && "sm:grid-cols-[260px_minmax(0,1fr)]",
      )}>
        <aside className={cn(
          "absolute inset-y-0 left-0 z-30 flex w-[min(280px,85vw)] min-w-0 flex-col overflow-hidden bg-[var(--panel)] shadow-xl transition-transform duration-200 sm:static sm:w-auto sm:shadow-none",
          sidebarCollapsed ? "-translate-x-full border-r-0 sm:translate-x-0" : "translate-x-0 border-r border-[var(--border)]",
        )}>
          <div className="flex h-11 shrink-0 items-center border-b border-[var(--border)] px-2.5">
            <label className="flex h-7.5 min-w-0 flex-1 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--input)] px-2 transition focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent-soft)]">
              <Search className="size-3.5 shrink-0 text-[var(--subtle)]" />
              <input
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
                      active={session.activeSession === asset.id}
                      selected={selectedAsset === asset.id}
                      onClick={() => setSelectedAsset(asset.id)}
                      onDoubleClick={() => { setSelectedAsset(asset.id); session.open(asset) }}
                      onEdit={() => openDialog(asset)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="flex justify-start border-t border-[var(--border)] p-2">
            <Button variant="ghost" size="sm" onClick={() => openDialog()}><Plus className="size-3.5" />{t("addAsset")}</Button>
          </div>
        </aside>

        <main ref={sessionLayoutRef} className="@container col-start-2 flex min-w-0 flex-col bg-[var(--canvas)]">
          <div className="flex h-9 shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
            <div role="tablist" className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {session.sessions.map((id) => {
                const asset = assets.find((item) => item.id === id)
                if (!asset) return null
                const meta = protocolMeta[asset.protocol]
                const isActive = session.activeSession === id
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
                      onClick={() => session.setActiveSession(id)}
                      className="grid h-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 px-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
                    >
                      <span className={cn("font-mono text-[9px]", meta.color)}>{meta.label}</span>
                      <span className="truncate font-medium">{asset.name}</span>
                    </button>
                    <button type="button" aria-label={t("closeSession", { name: asset.name })} onClick={() => session.close(id)} className="grid size-5 place-items-center rounded-md text-[var(--subtle)] outline-none hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><X className="size-3" /></button>
                  </div>
                )
              })}
            </div>
            <SessionActions
              active={Boolean(activeAsset)}
              fullscreen={fullscreen}
              onKeyboard={() => activeAsset && session.showKeyboard(activeAsset.id)}
              onSendKeys={(keys) => activeAsset && session.sendKeys(activeAsset.id, keys)}
              onReconnect={() => activeAsset && session.reconnect(activeAsset)}
              onFullscreen={toggleFullscreen}
              onDisconnect={() => activeAsset && session.close(activeAsset.id)}
            />
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--canvas)]">
            {session.sessions.map((id) => {
              const asset = assets.find((item) => item.id === id)
              if (!asset) return null
              return (
                <div key={id} className={cn("absolute inset-0", session.activeSession === id ? "visible z-10" : "invisible pointer-events-none")}>
                  <SessionViewport
                    ref={(handle) => session.registerHandle(id, handle)}
                    active={session.activeSession === id}
                    asset={asset}
                    connectionURL={session.connectionURLs[id]}
                    connectionError={session.connectionErrors[id]}
                    connecting={session.connectingIDs.has(id)}
                    onReconnect={() => session.reconnect(asset)}
                    onSessionEnded={() => session.ended(id)}
                    onReady={() => session.ready(id)}
                    onActivity={() => session.activity(id)}
                  />
                </div>
              )
            })}
          </div>
        </main>
      </div>

      <AssetDialog key={editingAsset?.id ?? "new"} asset={editingAsset} open={dialogOpen} onClose={closeDialog} onSubmit={saveAsset} onDelete={deleteAsset} />
      {(session.idleClosed || pwa.updateAvailable) && (
        <div className="fixed bottom-[calc(.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 flex-col gap-1.5">
          {session.idleClosed && <button type="button" onClick={session.clearIdleClosed} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs shadow-lg">{t("idleSessionClosed", { name: session.idleClosed })}</button>}
          {pwa.updateAvailable && <button type="button" onClick={pwa.applyUpdate} className="rounded-lg border border-[var(--accent)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--accent)] shadow-lg">{t("updateAvailable")} · {t("updateNow")}</button>}
        </div>
      )}
    </div>
  )
}
