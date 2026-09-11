import { useCallback, useEffect, useRef, useState } from "react"

import type { SessionHandle } from "@/components/session"
import { api, type Asset } from "@/lib/api"
import { clearSessions, loadSessions, saveSessions } from "@/lib/sessions"

const READY_TIMEOUT_MS = 15_000

export function useSessions(assets: Asset[], ready: boolean, idleTimeoutMs: number, connectionFailed: string, sessionEnded: string) {
  const [sessions, setSessions] = useState<string[]>([])
  const [activeSession, setActiveSessionState] = useState<string>()
  const [connectionURLs, setConnectionURLs] = useState<Record<string, string>>({})
  const [connectionErrors, setConnectionErrors] = useState<Record<string, string>>({})
  const [connectingIDs, setConnectingIDs] = useState<Set<string>>(() => new Set())
  const [connectedIDs, setConnectedIDs] = useState<Set<string>>(() => new Set())
  const [audioEnabledIDs, setAudioEnabledIDs] = useState<Set<string>>(() => new Set())
  const [audioSupportedIDs, setAudioSupportedIDs] = useState<Set<string>>(() => new Set())
  const [idleClosed, setIdleClosed] = useState("")
  const sessionsRef = useRef<string[]>([])
  const activeRef = useRef<string | undefined>(undefined)
  const urlsRef = useRef<Record<string, string>>({})
  const activityRef = useRef<Record<string, number>>({})
  const handlesRef = useRef(new Map<string, SessionHandle>())
  const audioEnabledRef = useRef(new Set<string>())
  const connectingRef = useRef(new Set<string>())
  const requestsRef = useRef(new Map<string, AbortController>())
  const readyResolversRef = useRef(new Map<string, () => void>())
  const queueRef = useRef(Promise.resolve())
  const restoredRef = useRef(false)

  const updateSessions = useCallback((next: string[]) => {
    sessionsRef.current = next
    setSessions(next)
  }, [])

  const updateURLs = useCallback((updater: (current: Record<string, string>) => Record<string, string>) => {
    const next = updater(urlsRef.current)
    urlsRef.current = next
    setConnectionURLs(next)
  }, [])

  const markActivity = useCallback((id: string) => {
    activityRef.current[id] = Date.now()
  }, [])

  const setActiveSession = useCallback((id?: string) => {
    if (id) markActivity(id)
    activeRef.current = id
    setActiveSessionState(id)
  }, [markActivity])

  const setConnecting = useCallback((id: string, value: boolean) => {
    if (value) connectingRef.current.add(id)
    else connectingRef.current.delete(id)
    setConnectingIDs(new Set(connectingRef.current))
  }, [])

  const resolveReady = useCallback((id: string) => {
    readyResolversRef.current.get(id)?.()
    readyResolversRef.current.delete(id)
  }, [])

  const cancelConnection = useCallback((id: string) => {
    requestsRef.current.get(id)?.abort()
    requestsRef.current.delete(id)
    resolveReady(id)
    setConnecting(id, false)
  }, [resolveReady, setConnecting])

  const setConnected = useCallback((id: string, value: boolean) => {
    setConnectedIDs((current) => {
      if (current.has(id) === value) return current
      const next = new Set(current)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const setAudioEnabled = useCallback((id: string, enabled: boolean) => {
    const next = new Set(audioEnabledRef.current)
    if (enabled) next.add(id)
    else next.delete(id)
    audioEnabledRef.current = next
    setAudioEnabledIDs(next)
  }, [])

  const setAudioSupported = useCallback((id: string, supported: boolean) => {
    if (!supported) setAudioEnabled(id, false)
    setAudioSupportedIDs((current) => {
      if (current.has(id) === supported) return current
      const next = new Set(current)
      if (supported) next.add(id)
      else next.delete(id)
      return next
    })
  }, [setAudioEnabled])

  const connect = useCallback((asset: Asset) => {
    if (connectingRef.current.has(asset.id)) return
    setConnected(asset.id, false)
    setConnecting(asset.id, true)
    const request = new AbortController()
    requestsRef.current.set(asset.id, request)
    queueRef.current = queueRef.current.then(async () => {
      if (request.signal.aborted) return
      setConnectionErrors((current) => ({ ...current, [asset.id]: "" }))
      try {
        const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark"
        const ticket = await api.connectAsset(asset.id, theme, request.signal)
        if (request.signal.aborted) return
        updateURLs((current) => ({ ...current, [asset.id]: ticket.url }))
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(() => resolveReady(asset.id), READY_TIMEOUT_MS)
          readyResolversRef.current.set(asset.id, () => {
            window.clearTimeout(timeout)
            resolve()
          })
        })
      } catch (reason) {
        if (request.signal.aborted) return
        setConnectionErrors((current) => ({
          ...current,
          [asset.id]: reason instanceof Error ? reason.message : connectionFailed,
        }))
      } finally {
        if (requestsRef.current.get(asset.id) === request) {
          requestsRef.current.delete(asset.id)
          setConnecting(asset.id, false)
        }
      }
    })
  }, [connectionFailed, resolveReady, setConnected, setConnecting, updateURLs])

  const close = useCallback((id: string) => {
    cancelConnection(id)
    void handlesRef.current.get(id)?.disconnect()
    handlesRef.current.delete(id)
    const current = sessionsRef.current
    const index = current.indexOf(id)
    const next = current.filter((sessionID) => sessionID !== id)
    updateSessions(next)
    if (activeRef.current === id) {
      activeRef.current = next[Math.min(index, next.length - 1)]
      setActiveSessionState(activeRef.current)
    }
    updateURLs((urls) => omitKey(urls, id))
    setConnectionErrors((errors) => omitKey(errors, id))
    delete activityRef.current[id]
    setAudioSupported(id, false)
    setConnected(id, false)
  }, [cancelConnection, setAudioSupported, setConnected, updateSessions, updateURLs])

  const reconnect = useCallback((asset: Asset) => {
    setConnected(asset.id, false)
    cancelConnection(asset.id)
    void handlesRef.current.get(asset.id)?.disconnect()
    updateURLs((current) => omitKey(current, asset.id))
    connect(asset)
  }, [cancelConnection, connect, setConnected, updateURLs])

  const toggleAudio = useCallback((asset: Asset) => {
    const enabled = !audioEnabledRef.current.has(asset.id)
    handlesRef.current.get(asset.id)?.setAudioEnabled(enabled)
    setAudioEnabled(asset.id, enabled)
    markActivity(asset.id)
  }, [markActivity, setAudioEnabled])

  const open = useCallback((asset: Asset) => {
    const next = sessionsRef.current.includes(asset.id) ? sessionsRef.current : [...sessionsRef.current, asset.id]
    updateSessions(next)
    setActiveSession(asset.id)
    if (!urlsRef.current[asset.id]) connect(asset)
  }, [connect, setActiveSession, updateSessions])

  const ended = useCallback((id: string, message = sessionEnded) => {
    if (!sessionsRef.current.includes(id)) return
    setConnected(id, false)
    cancelConnection(id)
    void handlesRef.current.get(id)?.disconnect()
    updateURLs((current) => omitKey(current, id))
    setConnectionErrors((current) => ({ ...current, [id]: message }))
  }, [cancelConnection, sessionEnded, setConnected, updateURLs])

  const readySession = useCallback((id: string) => {
    if (!sessionsRef.current.includes(id)) return
    setConnected(id, true)
    resolveReady(id)
  }, [resolveReady, setConnected])

  const registerHandle = useCallback((id: string, handle: SessionHandle | null) => {
    if (handle) handlesRef.current.set(id, handle)
    else handlesRef.current.delete(id)
  }, [])

  const showKeyboard = useCallback((id: string) => {
    handlesRef.current.get(id)?.showKeyboard()
  }, [])

  const sendKeys = useCallback((id: string, keys: readonly number[]) => {
    handlesRef.current.get(id)?.sendKeys(keys)
  }, [])

  const sendClipboard = useCallback((id: string, text: string) => {
    return handlesRef.current.get(id)?.sendClipboard(text) ?? false
  }, [])

  const syncClipboard = useCallback((id: string) => {
    return handlesRef.current.get(id)?.syncClipboard() ?? Promise.resolve()
  }, [])

  const captureKeys = useCallback((id: string, onComplete: (keys: readonly number[]) => void) => {
    return handlesRef.current.get(id)?.captureKeys(onComplete)
  }, [])

  const reset = useCallback(() => {
    for (const request of requestsRef.current.values()) request.abort()
    requestsRef.current.clear()
    for (const id of readyResolversRef.current.keys()) resolveReady(id)
    queueRef.current = Promise.resolve()
    connectingRef.current.clear()
    setConnectingIDs(new Set())
    updateSessions([])
    const disconnections = [...handlesRef.current.values()].map((handle) => handle.disconnect())
    handlesRef.current.clear()
    activeRef.current = undefined
    setActiveSessionState(undefined)
    updateURLs(() => ({}))
    setConnectionErrors({})
    setConnectedIDs(new Set())
    audioEnabledRef.current = new Set()
    setAudioEnabledIDs(new Set())
    setAudioSupportedIDs(new Set())
    activityRef.current = {}
    setIdleClosed("")
    clearSessions()
    return Promise.allSettled(disconnections)
  }, [resolveReady, updateSessions, updateURLs])

  useEffect(() => () => {
    for (const request of requestsRef.current.values()) request.abort()
    requestsRef.current.clear()
    for (const id of readyResolversRef.current.keys()) resolveReady(id)
    connectingRef.current.clear()
    queueRef.current = Promise.resolve()
    restoredRef.current = false
  }, [resolveReady])

  useEffect(() => {
    if (!ready || restoredRef.current) return
    restoredRef.current = true
    const stored = loadSessions()
    const now = Date.now()
    const valid = stored.ids.filter((id) => assets.some((asset) => asset.id === id) && now - (stored.activity[id] ?? now) < idleTimeoutMs)
    activityRef.current = Object.fromEntries(valid.map((id) => [id, stored.activity[id] ?? now]))
    updateSessions(valid)
    activeRef.current = valid.includes(stored.active ?? "") ? stored.active : valid[0]
    setActiveSessionState(activeRef.current)
    for (const id of valid) {
      const asset = assets.find((item) => item.id === id)
      if (asset) connect(asset)
    }
  }, [assets, connect, idleTimeoutMs, ready, updateSessions])

  useEffect(() => {
    if (!restoredRef.current) return
    const persist = () => saveSessions({ ids: sessionsRef.current, active: activeRef.current, activity: activityRef.current })
    persist()
    window.addEventListener("pagehide", persist)
    return () => window.removeEventListener("pagehide", persist)
  }, [activeSession, sessions])

  useEffect(() => {
    if (!ready) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      saveSessions({ ids: sessionsRef.current, active: activeRef.current, activity: activityRef.current })
      for (const id of sessionsRef.current) {
        if (now - (activityRef.current[id] ?? now) < idleTimeoutMs) continue
        setIdleClosed(assets.find((asset) => asset.id === id)?.name ?? id)
        close(id)
      }
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [assets, close, idleTimeoutMs, ready])

  return {
    sessions,
    activeSession,
    setActiveSession,
    connectionURLs,
    connectionErrors,
    connectingIDs,
    connectedIDs,
    audioEnabledIDs,
    audioSupportedIDs,
    setAudioSupported,
    idleClosed,
    clearIdleClosed: () => setIdleClosed(""),
    open,
    close,
    reconnect,
    toggleAudio,
    ended,
    ready: readySession,
    activity: markActivity,
    registerHandle,
    showKeyboard,
    sendClipboard,
    sendKeys,
    syncClipboard,
    captureKeys,
    reset,
  }
}

function omitKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}
