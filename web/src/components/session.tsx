import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Asset } from "@/lib/api"
import { GuacamoleSession, type GuacamoleFailure } from "@/lib/guacamole-session"
import { usePreferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"

export interface SessionHandle {
  captureKeys: (onComplete: (keys: readonly number[]) => void) => (() => void) | undefined
  disconnect: () => Promise<void>
  showKeyboard: () => boolean
  sendKeys: (keys: readonly number[]) => boolean
}

interface SessionViewportProps {
  active: boolean
  asset: Asset
  connectionURL?: string
  connectionError?: string
  connecting: boolean
  onReconnect: () => void
  onSessionEnded: (message: string) => void
  onReady: () => void
  onActivity: () => void
}

export const SessionViewport = forwardRef<SessionHandle, SessionViewportProps>(function SessionViewport({
  active,
  asset,
  connectionURL,
  connectionError,
  connecting,
  onReconnect,
  onSessionEnded,
  onReady,
  onActivity,
}, ref) {
  const { t } = usePreferences()
  const [frameReady, setFrameReady] = useState(false)
  const viewportRef = useRef<HTMLElement>(null)
  const displayHostRef = useRef<HTMLDivElement>(null)
  const displaySurfaceRef = useRef<HTMLDivElement>(null)
  const keyboardInputRef = useRef<HTMLTextAreaElement>(null)
  const controllerRef = useRef<GuacamoleSession>(null)
  const activeRef = useRef(active)
  const vncSettingsRef = useRef(asset.settings?.vnc)
  const onSessionEndedRef = useRef(onSessionEnded)
  const onReadyRef = useRef(onReady)
  const onActivityRef = useRef(onActivity)
  const notifyResizeRef = useRef<() => void>(() => undefined)

  activeRef.current = active
  onSessionEndedRef.current = onSessionEnded
  onReadyRef.current = onReady
  onActivityRef.current = onActivity

  const failureMessage = (failure: GuacamoleFailure) => {
    switch (failure) {
      case "sdk": return t("guacamoleSdkError")
      case "authentication": return t("guacamoleAuthenticationError")
      case "forbidden": return t("guacamoleForbiddenError")
      case "dns": return t("guacamoleDnsError")
      case "certificate": return t("guacamoleCertificateError")
      case "security": return t("guacamoleSecurityError")
      case "timeout": return t("guacamoleTimeoutError")
      case "busy": return t("guacamoleBusyError")
      case "conflict": return t("guacamoleConflictError")
      case "upstream": return t("guacamoleUpstreamError")
      default: return t("sessionEnded")
    }
  }
  const failureMessageRef = useRef(failureMessage)
  failureMessageRef.current = failureMessage

  useImperativeHandle(ref, () => ({
    captureKeys: (onComplete) => controllerRef.current?.captureKeys(onComplete),
    disconnect: () => controllerRef.current?.disconnect() ?? Promise.resolve(),
    showKeyboard: () => controllerRef.current?.focus() ?? false,
    sendKeys: (keys) => controllerRef.current?.sendKeys(keys) ?? false,
  }), [])

  useEffect(() => {
    const viewport = viewportRef.current
    const displayHost = displayHostRef.current
    const displaySurface = displaySurfaceRef.current
    const keyboardInput = keyboardInputRef.current
    if (!viewport || !displayHost || !displaySurface || !keyboardInput) return

    let resizeFrame = 0
    let resizeTimer = 0
    let resizeRetryTimer = 0
    const notifyResize = () => {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => controllerRef.current?.fitDisplay())
      window.clearTimeout(resizeTimer)
      window.clearTimeout(resizeRetryTimer)
      resizeTimer = window.setTimeout(() => controllerRef.current?.resizeRemote(), 80)
      resizeRetryTimer = window.setTimeout(() => controllerRef.current?.resizeRemote(), 320)
    }
    notifyResizeRef.current = notifyResize

    const controller = new GuacamoleSession(displayHost, displaySurface, keyboardInput, {
      isActive: () => activeRef.current,
      isRemoteCursor: () => vncSettingsRef.current?.cursor === "remote",
      isWheelReversed: () => vncSettingsRef.current?.wheelDirection === "reverse",
      onActivity: () => onActivityRef.current(),
      onDisplayResize: notifyResize,
      onEnded: (failure) => {
        setFrameReady(false)
        onSessionEndedRef.current(failureMessageRef.current(failure))
      },
      onReady: () => {
        setFrameReady(true)
        onReadyRef.current()
      },
    })
    controllerRef.current = controller

    const resizeObserver = new ResizeObserver(notifyResize)
    resizeObserver.observe(viewport)
    return () => {
      resizeObserver.disconnect()
      notifyResizeRef.current = () => undefined
      window.cancelAnimationFrame(resizeFrame)
      window.clearTimeout(resizeTimer)
      window.clearTimeout(resizeRetryTimer)
      if (controllerRef.current === controller) controllerRef.current = null
      void controller.dispose()
    }
  }, [])

  useEffect(() => {
    setFrameReady(false)
    vncSettingsRef.current = asset.settings?.vnc
    const controller = controllerRef.current
    if (!controller || !connectionURL) {
      void controller?.disconnect()
      return
    }
    void controller.connect(asset.name, connectionURL)
    return () => { void controller.disconnect() }
  }, [asset.name, connectionURL])

  useEffect(() => {
    if (!active || !frameReady) return
    const syncClipboard = () => void controllerRef.current?.syncClipboard()
    notifyResizeRef.current()
    syncClipboard()
    controllerRef.current?.focus()
    window.addEventListener("focus", syncClipboard)
    return () => window.removeEventListener("focus", syncClipboard)
  }, [active, frameReady])

  return (
    <section ref={viewportRef} className="relative h-full min-h-0 overflow-hidden bg-[var(--canvas)]">
      <div ref={displayHostRef} className={cn("grid size-full place-items-center overflow-hidden transition-opacity duration-100", connectionURL && frameReady ? "opacity-100" : "opacity-0")}>
        <div ref={displaySurfaceRef} className="relative shrink-0" />
      </div>
      <textarea
        ref={keyboardInputRef}
        tabIndex={-1}
        aria-label={t("remoteSession", { name: asset.name })}
        autoCapitalize="none"
        autoCorrect="off"
        enterKeyHint="done"
        inputMode="text"
        spellCheck={false}
        className="fixed bottom-0 left-0 size-px resize-none opacity-0 outline-none"
      />
      {connectionURL && !frameReady && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--canvas)]">
          <LoaderCircle className="size-4 animate-spin text-[var(--subtle)]" />
        </div>
      )}
      {!connectionURL && (
        <div className="absolute inset-0 grid place-items-center bg-[var(--canvas)]">
          {connecting || !connectionError ? (
            <LoaderCircle className="size-4 animate-spin text-[var(--subtle)]" />
          ) : (
            <div role="alertdialog" aria-modal="false" className="flex items-center gap-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 shadow-lg">
              <span className="max-w-80 text-xs text-[var(--muted)]">{connectionError}</span>
              <Button variant="outline" size="sm" onClick={onReconnect}><RefreshCw className="size-3.5" />{t("reconnect")}</Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
})
