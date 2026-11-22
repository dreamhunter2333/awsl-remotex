import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Asset } from "@/lib/api"
import type { GuacamoleFailure } from "@/lib/guacamole-connection"
import { GuacamoleSession, type ClipboardDirection } from "@/lib/guacamole-session"
import { usePreferences, type MessageKey } from "@/lib/preferences"
import { cn } from "@/lib/utils"

export interface SessionHandle {
  captureKeys: (onComplete: (keys: readonly number[]) => void) => (() => void) | undefined
  disconnect: () => Promise<void>
  toggleAudio: () => void
  sendClipboard: (text: string) => boolean
  showKeyboard: () => boolean
  sendKeys: (keys: readonly number[]) => boolean
  syncClipboard: () => Promise<void>
}

interface SessionViewportProps {
  ref?: Ref<SessionHandle>
  active: boolean
  asset: Asset
  connectionURL?: string
  connectionError?: string
  connecting: boolean
  onReconnect: () => void
  onSessionEnded: (message: string) => void
  onReady: () => void
  onActivity: () => void
  onAudioChanged: (enabled: boolean) => void
  onClipboard: (direction: ClipboardDirection, succeeded: boolean, text?: string) => void
}

const failureMessages = {
  sdk: "guacamoleSdkError",
  authentication: "guacamoleAuthenticationError",
  forbidden: "guacamoleForbiddenError",
  dns: "guacamoleDnsError",
  certificate: "guacamoleCertificateError",
  security: "guacamoleSecurityError",
  timeout: "guacamoleTimeoutError",
  busy: "guacamoleBusyError",
  conflict: "guacamoleConflictError",
  upstream: "guacamoleUpstreamError",
  disconnected: "sessionEnded",
} satisfies Record<GuacamoleFailure, MessageKey>

export function SessionViewport({
  ref,
  active,
  asset,
  connectionURL,
  connectionError,
  connecting,
  onReconnect,
  onSessionEnded,
  onReady,
  onActivity,
  onAudioChanged,
  onClipboard,
}: SessionViewportProps) {
  const { t } = usePreferences()
  const [frameReady, setFrameReady] = useState(false)
  const viewportRef = useRef<HTMLElement>(null)
  const displayHostRef = useRef<HTMLDivElement>(null)
  const displaySurfaceRef = useRef<HTMLDivElement>(null)
  const keyboardInputRef = useRef<HTMLTextAreaElement>(null)
  const controllerRef = useRef<GuacamoleSession>(null)
  const vncSettingsRef = useRef(asset.settings?.vnc)
  const notifyResizeRef = useRef<() => void>(null)
  const bindings = { active, asset, onSessionEnded, onReady, onActivity, onAudioChanged, onClipboard, t }
  const current = useRef(bindings)

  useLayoutEffect(() => {
    current.current = bindings
  })

  useImperativeHandle(ref, () => ({
    captureKeys: (onComplete) => controllerRef.current?.captureKeys(onComplete),
    disconnect: () => controllerRef.current?.disconnect() ?? Promise.resolve(),
    toggleAudio: () => controllerRef.current?.toggleAudio(),
    sendClipboard: (text) => controllerRef.current?.setClipboard(text) ?? false,
    showKeyboard: () => controllerRef.current?.focus() ?? false,
    sendKeys: (keys) => controllerRef.current?.sendKeys(keys) ?? false,
    syncClipboard: () => controllerRef.current?.syncClipboard() ?? Promise.resolve(),
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
      isActive: () => current.current.active,
      isRemoteCursor: () => vncSettingsRef.current?.cursor === "remote",
      isWheelReversed: () => vncSettingsRef.current?.wheelDirection === "reverse",
      onActivity: () => current.current.onActivity(),
      onAudioChanged: (enabled) => current.current.onAudioChanged(enabled),
      onClipboard: (direction, succeeded, text) => current.current.onClipboard(direction, succeeded, text),
      onDisplayResize: notifyResize,
      onEnded: (failure) => {
        setFrameReady(false)
        const { onSessionEnded, t } = current.current
        onSessionEnded(t(failureMessages[failure]))
      },
      onReady: () => {
        setFrameReady(true)
        current.current.onReady()
      },
    })
    controllerRef.current = controller

    const resizeObserver = new ResizeObserver(notifyResize)
    resizeObserver.observe(viewport)
    return () => {
      resizeObserver.disconnect()
      notifyResizeRef.current = null
      window.cancelAnimationFrame(resizeFrame)
      window.clearTimeout(resizeTimer)
      window.clearTimeout(resizeRetryTimer)
      if (controllerRef.current === controller) controllerRef.current = null
      void controller.dispose()
    }
  }, [])

  useEffect(() => {
    setFrameReady(false)
    const { asset } = current.current
    vncSettingsRef.current = asset.settings?.vnc
    const controller = controllerRef.current
    if (!controller || !connectionURL) {
      void controller?.disconnect()
      return
    }
    void controller.connect(asset.name, connectionURL, asset.protocol === "rdp")
    return () => { void controller.disconnect() }
  }, [connectionURL])

  useEffect(() => {
    if (!active || !frameReady) return
    const syncClipboard = () => void controllerRef.current?.syncClipboard()
    const clipboard = navigator.clipboard as (Clipboard & { onclipboardchange?: unknown }) | undefined
    const supportsClipboardChange = clipboard && "onclipboardchange" in clipboard
    notifyResizeRef.current?.()
    syncClipboard()
    if (!document.activeElement?.closest('[role="tablist"]')) controllerRef.current?.focus()
    if (supportsClipboardChange) clipboard.addEventListener("clipboardchange", syncClipboard)
    window.addEventListener("focus", syncClipboard)
    return () => {
      if (supportsClipboardChange) clipboard.removeEventListener("clipboardchange", syncClipboard)
      window.removeEventListener("focus", syncClipboard)
    }
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
}
