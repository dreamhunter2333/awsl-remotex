import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react"

import { AssetDialog } from "@/components/asset-dialog"
import { AssetSidebar } from "@/components/asset-sidebar"
import { LoadingScreen, LoginScreen } from "@/components/auth-screens"
import { ClipboardDialog } from "@/components/clipboard-dialog"
import { GitHubMark } from "@/components/icons/github-mark"
import { PreferenceControls } from "@/components/preference-controls"
import { SessionActions } from "@/components/session-actions"
import { SessionViewport } from "@/components/session"
import { SessionTabs } from "@/components/session-tabs"
import { Button } from "@/components/ui/button"
import { api, completeOIDC, expireSession, sessionExpiredEvent, type Asset, type AssetInput, type AuthStatus } from "@/lib/api"
import type { ClipboardDirection } from "@/lib/guacamole-session"
import { readLocalStorage, writeLocalStorage } from "@/lib/local-storage"
import { usePreferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"
import { useSessions } from "@/hooks/use-sessions"

const sidebarKey = "awsl-remotex.sidebar"

export default function App() {
  const { t } = usePreferences()
  const [authStatus, setAuthStatus] = useState<AuthStatus>()
  const [assets, setAssets] = useState<Asset[]>([])
  const [selectedAsset, setSelectedAsset] = useState<string>()
  const [loading, setLoading] = useState(true)
  const workspaceRequest = useRef<AbortController>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const loggingOutRef = useRef(false)
  const [error, setError] = useState("")
  const [oidcCallbackFailed, setOIDCCallbackFailed] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAsset, setEditingAsset] = useState<Asset>()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const stored = readLocalStorage(sidebarKey)
    return stored === null ? window.matchMedia("(max-width: 639px)").matches : stored === "collapsed"
  })
  const [fullscreen, setFullscreen] = useState(false)
  const [clipboardOpen, setClipboardOpen] = useState(false)
  const [sessionClipboards, setSessionClipboards] = useState<Record<string, string>>({})
  const [clipboardToast, setClipboardToast] = useState<{ message: string; succeeded: boolean }>()
  const sessionLayoutRef = useRef<HTMLElement>(null)
  const session = useSessions(
    assets,
    Boolean(authStatus?.authenticated && !loading && !loggingOut),
    (authStatus?.sessionIdleSeconds ?? 86_400) * 1_000,
    t("connectionFailed"),
    t("sessionEnded"),
  )
  const resetSessions = session.reset
  const clearWorkspace = useCallback(() => {
    workspaceRequest.current?.abort()
    setLoading(false)
    setError("")
    setAssets([])
    setSelectedAsset(undefined)
    setSessionClipboards({})
    setClipboardOpen(false)
    setClipboardToast(undefined)
    setDialogOpen(false)
    setEditingAsset(undefined)
    setAuthStatus((status) => status && { ...status, authenticated: false })
  }, [])

  const loadWorkspace = useCallback(async (signal: AbortSignal) => {
    const status = await api.authStatus(signal)
    if (signal.aborted) return
    setAuthStatus(status)
    if (!status.authenticated) return
    const currentAssets = await api.listAssets(signal)
    if (!signal.aborted) setAssets(currentAssets)
  }, [])

  useEffect(() => {
    const onExpired = () => {
      void resetSessions()
      clearWorkspace()
    }
    window.addEventListener(sessionExpiredEvent, onExpired)
    return () => window.removeEventListener(sessionExpiredEvent, onExpired)
  }, [clearWorkspace, resetSessions])

  useEffect(() => {
    if (!authStatus?.authenticated || authStatus.sessionExpiresInMs === undefined) return
    const timer = window.setTimeout(expireSession, authStatus.sessionExpiresInMs)
    return () => window.clearTimeout(timer)
  }, [authStatus])

  useEffect(() => {
    const request = new AbortController()
    const { signal } = request
    workspaceRequest.current = request
    completeOIDC()
      .catch(() => {
        if (!signal.aborted) setOIDCCallbackFailed(true)
      })
      .then(() => {
        if (!signal.aborted) return loadWorkspace(signal)
      })
      .catch((reason: Error) => {
        if (!signal.aborted) setError(reason.message)
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false)
      })
    return () => workspaceRequest.current?.abort()
  }, [loadWorkspace])

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === sessionLayoutRef.current)
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  useEffect(() => {
    writeLocalStorage(sidebarKey, sidebarCollapsed ? "collapsed" : "expanded")
  }, [sidebarCollapsed])

  useEffect(() => {
    if (!clipboardToast) return
    const timer = window.setTimeout(() => setClipboardToast(undefined), 2500)
    return () => window.clearTimeout(timer)
  }, [clipboardToast])

  const assetsByID = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])
  const openAssets = session.sessions.flatMap((id) => {
    const asset = assetsByID.get(id)
    return asset ? [asset] : []
  })
  const activeAsset = assetsByID.get(session.activeSession ?? "")
  const activeConnected = Boolean(activeAsset && session.connectedIDs.has(activeAsset.id))
  const activeConnecting = Boolean(activeAsset && session.connectingIDs.has(activeAsset.id))
  const sidebarAction = t(sidebarCollapsed ? "expandSidebar" : "collapseSidebar")
  const toggleSidebar = () => setSidebarCollapsed((collapsed) => !collapsed)

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
    workspaceRequest.current?.abort()
    const request = new AbortController()
    const { signal } = request
    workspaceRequest.current = request
    setLoading(true)
    setError("")
    setOIDCCallbackFailed(false)
    try {
      await loadWorkspace(signal)
    } catch (reason) {
      if (!signal.aborted) setError(reason instanceof Error ? reason.message : t("connectionFailed"))
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }

  const logout = async () => {
    if (loggingOutRef.current) return
    loggingOutRef.current = true
    setLoggingOut(true)
    setError("")
    try {
      await session.reset()
      await api.logout()
      await session.reset()
      clearWorkspace()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("connectionFailed"))
      setSidebarCollapsed(false)
    } finally {
      loggingOutRef.current = false
      setLoggingOut(false)
    }
  }

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await sessionLayoutRef.current?.requestFullscreen()
  }

  const showClipboardToast = (sessionID: string, direction: ClipboardDirection, succeeded: boolean, text?: string) => {
    if (text !== undefined) setSessionClipboards((current) => ({ ...current, [sessionID]: text }))
    const message = succeeded
      ? t(direction === "local-to-remote" ? "clipboardToRemote" : "clipboardToLocal")
      : t(direction === "local-to-remote" ? "clipboardToRemoteFailed" : "clipboardToLocalFailed")
    setClipboardToast({ message, succeeded })
  }

  if (loggingOut) {
    return <LoadingScreen message={t("signingOut")} error={false} />
  }
  if (!authStatus) {
    return <LoadingScreen message={error || t("checkingAuthentication")} error={Boolean(error)} />
  }
  if (!authStatus.authenticated) {
    return <LoginScreen onAuthenticated={finishLogin} oidc={authStatus.oidc} callbackError={error || (oidcCallbackFailed ? t("oidcLoginFailed") : undefined)} />
  }

  return (
    <div className="app-shell flex h-dvh flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <header data-local-keyboard className="flex h-11 shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--panel)] px-3.5 sm:gap-2">
        <span className="min-w-0 truncate text-sm font-semibold tracking-[-0.025em]">Awsl RemoteX</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 sm:size-7"
          onClick={toggleSidebar}
          aria-controls="asset-sidebar"
          aria-expanded={!sidebarCollapsed}
          aria-label={sidebarAction}
          title={sidebarAction}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
        <div className="min-w-0 flex-1" />
        <a
          href="https://github.com/dreamhunter2333/awsl-remotex"
          target="_blank"
          rel="noreferrer"
          aria-label={`Awsl RemoteX ${__APP_VERSION__} · GitHub`}
          title="GitHub"
          className="inline-flex size-9 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 font-mono text-[10px] font-medium tabular-nums text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:h-7 sm:w-auto"
        >
          <GitHubMark className="size-3.5 shrink-0" />
          <span className="hidden sm:inline">{__APP_VERSION__}</span>
        </a>
        <PreferenceControls />
        {authStatus.required && <Button variant="danger" size="icon" className="size-9 shrink-0 sm:size-7" onClick={logout} aria-label={t("logout")} title={t("logout")}><LogOut className="size-3.5" /></Button>}
      </header>

      <div className={cn(
        "relative grid min-h-0 flex-1 grid-cols-[0_minmax(0,1fr)] transition-[grid-template-columns] duration-200",
        !sidebarCollapsed && "sm:grid-cols-[260px_minmax(0,1fr)]",
      )}>
        <AssetSidebar
          assets={assets}
          activeAssetId={session.activeSession}
          selectedAsset={selectedAsset}
          collapsed={sidebarCollapsed}
          loading={loading}
          error={error}
          onAdd={() => openDialog()}
          onEdit={openDialog}
          onSelect={setSelectedAsset}
          onConnect={(asset) => {
            setSelectedAsset(asset.id)
            session.open(asset)
          }}
        />

        <main ref={sessionLayoutRef} className="@container col-start-2 flex min-w-0 flex-col bg-[var(--canvas)]">
          <div className="flex h-9 shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
            <SessionTabs
              assets={openAssets}
              activeSession={session.activeSession}
              onActivate={session.setActiveSession}
              onClose={session.close}
            />
            <SessionActions
              active={Boolean(activeAsset)}
              connected={activeConnected}
              connecting={activeConnecting}
              fullscreen={fullscreen}
              audioEnabled={Boolean(activeAsset && session.audioEnabledIDs.has(activeAsset.id))}
              showAudio={activeAsset?.protocol === "rdp" && session.audioSupportedIDs.has(activeAsset.id)}
              onToggleAudio={() => activeAsset && session.toggleAudio(activeAsset)}
              onClipboard={() => {
                setClipboardOpen(true)
                if (activeAsset) void session.syncClipboard(activeAsset.id)
              }}
              onKeyboard={() => activeAsset && session.showKeyboard(activeAsset.id)}
              onSendKeys={(keys) => activeAsset && session.sendKeys(activeAsset.id, keys)}
              onCaptureKeys={(onComplete) => activeAsset ? session.captureKeys(activeAsset.id, onComplete) : undefined}
              onReconnect={() => activeAsset && session.reconnect(activeAsset)}
              onFullscreen={toggleFullscreen}
              onDisconnect={() => activeAsset && session.close(activeAsset.id)}
            />
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--canvas)]">
            {openAssets.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm font-medium text-[var(--muted)]">{t("noSession")}</p>
                <p className="max-w-sm text-xs leading-5 text-[var(--subtle)]">{t("connectHint")}</p>
                {assets.length > 0
                  ? <Button variant="outline" size="sm" onClick={toggleSidebar} aria-controls="asset-sidebar" aria-expanded={!sidebarCollapsed}>
                    {sidebarAction}
                  </Button>
                  : <Button variant="outline" size="sm" onClick={() => openDialog()}>{t("addAsset")}</Button>}
              </div>
            )}
            {openAssets.map((asset) => {
              const { id } = asset
              return (
                <div key={id} id={`session-panel-${id}`} role="tabpanel" aria-labelledby={`session-tab-${id}`} className={cn("absolute inset-0", session.activeSession === id ? "visible z-10" : "invisible pointer-events-none")}>
                  <SessionViewport
                    ref={(handle) => session.registerHandle(id, handle)}
                    active={session.activeSession === id}
                    asset={asset}
                    connectionURL={session.connectionURLs[id]}
                    connectionError={session.connectionErrors[id]}
                    connecting={session.connectingIDs.has(id)}
                    onReconnect={() => session.reconnect(asset)}
                    onSessionEnded={(message) => session.ended(id, message)}
                    onReady={() => session.ready(id)}
                    onActivity={() => session.activity(id)}
                    onAudioCapability={(supported) => session.setAudioSupported(id, supported)}
                    onClipboard={(direction, succeeded, text) => showClipboardToast(id, direction, succeeded, text)}
                  />
                </div>
              )
            })}
          </div>
          <ClipboardDialog
            open={clipboardOpen && activeConnected}
            text={activeAsset ? sessionClipboards[activeAsset.id] ?? "" : ""}
            notification={clipboardToast}
            onChange={(text) => {
              if (!activeAsset) return
              setSessionClipboards((current) => ({ ...current, [activeAsset.id]: text }))
              session.sendClipboard(activeAsset.id, text)
            }}
            onClose={() => setClipboardOpen(false)}
          />
          {clipboardToast && !(clipboardOpen && activeConnected) && (
            <div role={clipboardToast.succeeded ? "status" : "alert"} className={cn(
              "fixed bottom-[calc(.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-[var(--surface)] px-3 py-2 text-xs shadow-lg",
              clipboardToast.succeeded ? "border-[var(--green)] text-[var(--foreground)]" : "border-[var(--danger)] text-[var(--danger)]",
            )}>
              {clipboardToast.message}
            </div>
          )}
        </main>
      </div>

      <AssetDialog key={editingAsset?.id ?? "new"} asset={editingAsset} open={dialogOpen} onClose={closeDialog} onSubmit={saveAsset} onDelete={deleteAsset} />
      {session.idleClosed && (
        <div className="fixed bottom-[calc(.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 flex-col gap-1.5">
          <button type="button" onClick={session.clearIdleClosed} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs shadow-lg">{t("idleSessionClosed", { name: session.idleClosed })}</button>
        </div>
      )}
    </div>
  )
}
