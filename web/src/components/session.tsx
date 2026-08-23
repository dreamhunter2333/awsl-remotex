import { useEffect, useRef, useState } from "react"
import { LoaderCircle, Maximize2, Minimize2, Power, RefreshCw, Settings2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Asset } from "@/lib/api"
import { usePreferences } from "@/lib/preferences"
import { cn } from "@/lib/utils"

export function SessionViewport({ active, asset, connectionURL, connectionError, connecting, onReconnect, onSessionEnded }: {
  active: boolean
  asset: Asset
  connectionURL?: string
  connectionError?: string
  connecting: boolean
  onReconnect: () => void
  onSessionEnded: () => void
}) {
  const { t } = usePreferences()
  const [frameReady, setFrameReady] = useState(false)
  const viewportRef = useRef<HTMLElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const onSessionEndedRef = useRef(onSessionEnded)
  const activeRef = useRef(active)

  useEffect(() => { onSessionEndedRef.current = onSessionEnded }, [onSessionEnded])
  useEffect(() => {
    activeRef.current = active
    if (!active || !frameReady) return
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
    let resizeFrame = 0
    let focusTimer = 0
    const startedAt = Date.now()

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
          setFrameReady(true)
          window.requestAnimationFrame(focusFrame)
          return
        }
        setFrameReady(false)
        if (sawClientRoute || Date.now() - startedAt > 8_000) onSessionEndedRef.current()
      } catch {
        setFrameReady(true)
      }
    }

    const notifyResize = () => {
      window.cancelAnimationFrame(resizeFrame)
      resizeFrame = window.requestAnimationFrame(() => {
        try {
          iframe.contentWindow?.dispatchEvent(new Event("resize"))
        } catch {
          return
        }
      })
      window.clearTimeout(focusTimer)
      focusTimer = window.setTimeout(focusFrame, 240)
    }

    const attachFrameListeners = () => {
      try {
        iframe.contentWindow?.addEventListener("hashchange", inspectRoute)
      } catch {
        return
      }
      inspectRoute()
      notifyResize()
    }

    iframe.addEventListener("load", attachFrameListeners)
    window.addEventListener("focus", focusFrame)
    const resizeObserver = new ResizeObserver(notifyResize)
    resizeObserver.observe(viewport)
    const routePoll = window.setInterval(inspectRoute, 250)
    attachFrameListeners()

    return () => {
      iframe.removeEventListener("load", attachFrameListeners)
      window.removeEventListener("focus", focusFrame)
      try {
        iframe.contentWindow?.removeEventListener("hashchange", inspectRoute)
      } catch {
        // The frame may have navigated away before cleanup.
      }
      resizeObserver.disconnect()
      window.clearInterval(routePoll)
      window.cancelAnimationFrame(resizeFrame)
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
        <div className="flex items-center gap-2 text-xs text-[var(--danger)]">
          <span>{connectionError}</span>
          <Button variant="ghost" size="icon" onClick={onReconnect} aria-label={t("reconnect")} title={t("reconnect")}><RefreshCw className="size-3.5" /></Button>
        </div>
      )}
    </section>
  )
}

export function SessionActions({ active, fullscreen, onReconnect, onFullscreen, onDisconnect }: {
  active: boolean
  fullscreen: boolean
  onReconnect: () => void
  onFullscreen: () => void
  onDisconnect: () => void
}) {
  const { t } = usePreferences()
  const menuRef = useRef<HTMLDetailsElement>(null)
  const run = (action: () => void) => {
    action()
    if (menuRef.current) menuRef.current.open = false
  }

  return (
    <div className="relative flex shrink-0 items-center border-l border-[var(--border)] px-1">
      <div className="hidden items-center gap-0.5 @[520px]:flex">
        <Button variant="ghost" size="icon" disabled={!active} onClick={onReconnect} aria-label={t("reconnect")} title={t("reconnect")}><RefreshCw className="size-4" /></Button>
        <Button variant="ghost" size="icon" disabled={!active} onClick={onFullscreen} aria-label={t(fullscreen ? "exitFullscreen" : "fullscreen")} title={t(fullscreen ? "exitFullscreen" : "fullscreen")}>{fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</Button>
        <Button variant="danger" size="icon" disabled={!active} onClick={onDisconnect} aria-label={t("disconnect")} title={t("disconnect")}><Power className="size-4" /></Button>
      </div>
      <details ref={menuRef} className="group @[520px]:hidden">
        <summary className="grid size-7 cursor-pointer list-none place-items-center rounded-md text-[var(--muted)] outline-none hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden" aria-label={t("sessionActions")} title={t("sessionActions")}><Settings2 className="size-4" /></summary>
        <div className="absolute right-1 top-[calc(100%+4px)] z-50 min-w-32 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-lg">
          <button type="button" disabled={!active} onClick={() => run(onReconnect)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40"><RefreshCw className="size-3.5" />{t("reconnect")}</button>
          <button type="button" disabled={!active} onClick={() => run(onFullscreen)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40">{fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}{t(fullscreen ? "exitFullscreen" : "fullscreen")}</button>
          <button type="button" disabled={!active} onClick={() => run(onDisconnect)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-40"><Power className="size-3.5" />{t("disconnect")}</button>
        </div>
      </details>
    </div>
  )
}
