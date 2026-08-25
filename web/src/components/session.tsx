import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Asset } from "@/lib/api"
import { findGuacamoleClient, fitGuacamoleDisplay, resizeGuacamoleRemote } from "@/lib/guacamole-frame"
import { sendKeyCombination } from "@/lib/guacamole-keys"
import { usePreferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"

export interface SessionHandle {
  disconnect: () => Promise<void>
  showKeyboard: () => boolean
  sendKeys: (keys: readonly number[]) => boolean
}

export const SessionViewport = forwardRef<SessionHandle, {
  active: boolean
  asset: Asset
  connectionURL?: string
  connectionError?: string
  connecting: boolean
  onReconnect: () => void
  onSessionEnded: () => void
  onReady: () => void
  onActivity: () => void
}>(function SessionViewport({ active, asset, connectionURL, connectionError, connecting, onReconnect, onSessionEnded, onReady, onActivity }, ref) {
  const { t } = usePreferences()
  const [frameReady, setFrameReady] = useState(false)
  const viewportRef = useRef<HTMLElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const onSessionEndedRef = useRef(onSessionEnded)
  const onReadyRef = useRef(onReady)
  const onActivityRef = useRef(onActivity)
  const activeRef = useRef(active)
  const tokenRef = useRef("")
  const notifyResizeRef = useRef<() => void>(() => undefined)

  useEffect(() => { onSessionEndedRef.current = onSessionEnded }, [onSessionEnded])
  useEffect(() => { onReadyRef.current = onReady }, [onReady])
  useEffect(() => { onActivityRef.current = onActivity }, [onActivity])

  useImperativeHandle(ref, () => ({
    disconnect: async () => {
      const token = tokenRef.current
      if (!token) return
      tokenRef.current = ""
      const encoded = encodeURIComponent(token)
      await fetch(`/guacamole/api/tokens/${encoded}?token=${encoded}`, { method: "DELETE", keepalive: true }).catch(() => undefined)
    },
    showKeyboard: () => {
      const input = iframeRef.current?.contentDocument?.querySelector<HTMLTextAreaElement>(".client textarea:not(.clipboard-service-target)")
      if (!input) return false
      input.focus({ preventScroll: true })
      return input.ownerDocument.activeElement === input
    },
    sendKeys: (keys) => sendKeyCombination(findGuacamoleClient(iframeRef.current), keys),
  }), [])
  useEffect(() => {
    activeRef.current = active
    if (!active || !frameReady) return
    notifyResizeRef.current()
    iframeRef.current?.focus()
    iframeRef.current?.contentWindow?.focus()
  }, [active, frameReady])

  useEffect(() => {
    setFrameReady(false)
    if (!connectionURL) return

    const iframe = iframeRef.current
    const viewport = viewportRef.current
    if (!iframe || !viewport) return

    let sawClientRoute = false
    let sawConnectedView = false
    let resizeFrame = 0
    let resizeTimer = 0
    let resizeRetryTimer = 0
    let focusTimer = 0
    let routeTimer = 0
    let mutationObserver: MutationObserver | undefined
    const activityEvents = ["pointerdown", "keydown", "touchstart", "wheel"] as const
    const reportActivity = () => onActivityRef.current()

    const focusFrame = () => {
      if (!activeRef.current || document.querySelector("dialog[open]")) return
      const focused = document.activeElement
      if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused instanceof HTMLSelectElement) return
      iframe.focus()
      iframe.contentWindow?.focus()
    }

    const inspectRoute = () => {
      try {
        const hash = iframe.contentWindow?.location.hash ?? ""
        if (hash.startsWith("#/client/")) {
          sawClientRoute = true
          tokenRef.current = readGuacamoleToken(iframe.contentWindow?.localStorage.getItem("GUAC_AUTH_TOKEN"))
          return
        }
        setFrameReady(false)
        if (sawClientRoute) onSessionEndedRef.current()
      } catch {
        setFrameReady(true)
      }
    }

    const inspectStatus = () => {
      try {
        const document = iframe.contentDocument
        const status = document?.querySelector(".client-status-modal")
        if (!document?.querySelector(".client-main") || !status) return
        if (!status.classList.contains("shown")) {
          if (sawConnectedView) return
          sawConnectedView = true
          setFrameReady(true)
          tokenRef.current = readGuacamoleToken(iframe.contentWindow?.localStorage.getItem("GUAC_AUTH_TOKEN"))
          onReadyRef.current()
          notifyResize()
          window.requestAnimationFrame(focusFrame)
          return
        }
        if (sawConnectedView) onSessionEndedRef.current()
      } catch {
        setFrameReady(true)
      }
    }

    const notifyResize = () => {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => {
        fitGuacamoleDisplay(iframe)
      })
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => resizeGuacamoleRemote(iframe), 80)
      window.clearTimeout(resizeRetryTimer)
      resizeRetryTimer = window.setTimeout(() => resizeGuacamoleRemote(iframe), 320)
      window.clearTimeout(focusTimer)
      focusTimer = window.setTimeout(focusFrame, 240)
    }

    notifyResizeRef.current = notifyResize

    const attachFrameListeners = () => {
      try {
        iframe.contentWindow?.addEventListener("hashchange", inspectRoute)
        activityEvents.forEach((name) => iframe.contentWindow?.addEventListener(name, reportActivity, { capture: true }))
        mutationObserver?.disconnect()
        mutationObserver = new MutationObserver(inspectStatus)
        if (iframe.contentDocument?.documentElement) {
          mutationObserver.observe(iframe.contentDocument.documentElement, { attributes: true, childList: true, subtree: true })
        }
      } catch {
        return
      }
      inspectRoute()
      inspectStatus()
      notifyResize()
    }

    iframe.addEventListener("load", attachFrameListeners)
    window.addEventListener("focus", focusFrame)
    const resizeObserver = new ResizeObserver(notifyResize)
    resizeObserver.observe(viewport)
    routeTimer = window.setTimeout(() => {
      if (!sawConnectedView) onSessionEndedRef.current()
    }, 15_000)
    attachFrameListeners()

    return () => {
      iframe.removeEventListener("load", attachFrameListeners)
      window.removeEventListener("focus", focusFrame)
      try {
        iframe.contentWindow?.removeEventListener("hashchange", inspectRoute)
        activityEvents.forEach((name) => iframe.contentWindow?.removeEventListener(name, reportActivity, { capture: true }))
      } catch {
        // The frame may have navigated away before cleanup.
      }
      resizeObserver.disconnect()
      mutationObserver?.disconnect()
      notifyResizeRef.current = () => undefined
      window.clearTimeout(routeTimer)
      window.cancelAnimationFrame(resizeFrame)
      window.clearTimeout(resizeTimer)
      window.clearTimeout(resizeRetryTimer)
      window.clearTimeout(focusTimer)
    }
  }, [connectionURL])

  if (connectionURL) {
    return (
      <section ref={viewportRef} className="relative h-full min-h-0 overflow-hidden bg-[var(--canvas)]">
        <iframe
          ref={iframeRef}
          key={connectionURL}
          src={connectionURL}
          title={t("remoteSession", { name: asset.name })}
          allow="clipboard-read; clipboard-write; fullscreen"
          className={cn("size-full border-0 bg-[var(--canvas)] transition-opacity duration-100", frameReady ? "opacity-100" : "opacity-0")}
        />
        {!frameReady && <div className="absolute inset-0 grid place-items-center bg-[var(--canvas)]"><LoaderCircle className="size-4 animate-spin text-[var(--subtle)]" /></div>}
      </section>
    )
  }

  return (
    <section className="grid h-full min-h-0 place-items-center overflow-hidden bg-[var(--canvas)]">
      {connecting || !connectionError ? (
        <LoaderCircle className="size-4 animate-spin text-[var(--subtle)]" />
      ) : (
        <div role="alertdialog" aria-modal="false" className="flex items-center gap-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 shadow-lg">
          <span className="max-w-80 text-xs text-[var(--muted)]">{connectionError}</span>
          <Button variant="outline" size="sm" onClick={onReconnect}><RefreshCw className="size-3.5" />{t("reconnect")}</Button>
        </div>
      )}
    </section>
  )
})

function readGuacamoleToken(value: string | null | undefined) {
  if (!value) return ""
  try {
    const parsed = JSON.parse(value) as unknown
    return typeof parsed === "string" ? parsed : value
  } catch {
    return value
  }
}
