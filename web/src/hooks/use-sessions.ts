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
  const [idleClosed, setIdleClosed] = useState("")
  const sessionsRef = useRef<string[]>([])
  const activeRef = useRef<string | undefined>(undefined)
  const urlsRef = useRef<Record<string, string>>({})
  const activityRef = useRef<Record<string, number>>({})
  const handlesRef = useRef(new Map<string, SessionHandle>())
  const connectingRef = useRef(new Set<string>())
  const generationsRef = useRef(new Map<string, number>())
  const readyResolversRef = useRef(new Map<string, () => void>())
  const queueRef = useRef(Promise.resolve())
  const restoredRef = useRef(false)

  const updateSessions = useCallback((next: string[]) => {
    sessionsRef.current = next
    setSessions(next)
  }, [])

  const updateURLs = useCallback((updater: (current: Record<string, string>) => Record<string, string>) => {
    setConnectionURLs((current) => {
      const next = updater(current)
      urlsRef.current = next
      return next
    })
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

  const connect = useCallback((asset: Asset) => {
    if (connectingRef.current.has(asset.id)) return
    setConnecting(asset.id, true)
    const generation = generationsRef.current.get(asset.id) ?? 0
    queueRef.current = queueRef.current.then(async () => {
      setConnectionErrors((current) => ({ ...current, [asset.id]: "" }))
      try {
        const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark"
        const ticket = await api.connectAsset(asset.id, theme)
        if ((generationsRef.current.get(asset.id) ?? 0) !== generation) return
        updateURLs((current) => ({ ...current, [asset.id]: ticket.url }))
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, READY_TIMEOUT_MS)
          readyResolversRef.current.set(asset.id, () => {
            window.clearTimeout(timeout)
            resolve()
          })
        })
      } catch (reason) {
        if ((generationsRef.current.get(asset.id) ?? 0) !== generation) return
        setConnectionErrors((current) => ({
          ...current,
          [asset.id]: reason instanceof Error ? reason.message : connectionFailed,
        }))
      } finally {
        setConnecting(asset.id, false)
      }
    })
  }, [connectionFailed, setConnecting, updateURLs])

  const close = useCallback((id: string) => {
    generationsRef.current.set(id, (generationsRef.current.get(id) ?? 0) + 1)
    resolveReady(id)
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
  }, [resolveReady, updateSessions, updateURLs])

  const reconnect = useCallback((asset: Asset) => {
    generationsRef.current.set(asset.id, (generationsRef.current.get(asset.id) ?? 0) + 1)
    resolveReady(asset.id)
    void handlesRef.current.get(asset.id)?.disconnect()
    updateURLs((current) => omitKey(current, asset.id))
    if (connectingRef.current.has(asset.id)) {
      queueRef.current = queueRef.current.then(() => connect(asset))
      return
    }
    connect(asset)
  }, [connect, resolveReady, updateURLs])

  const open = useCallback((asset: Asset) => {
    const next = sessionsRef.current.includes(asset.id) ? sessionsRef.current : [...sessionsRef.current, asset.id]
    updateSessions(next)
    setActiveSession(asset.id)
    if (!urlsRef.current[asset.id]) connect(asset)
  }, [connect, setActiveSession, updateSessions])

  const ended = useCallback((id: string, message = sessionEnded) => {
    resolveReady(id)
    void handlesRef.current.get(id)?.disconnect()
    updateURLs((current) => omitKey(current, id))
    setConnectionErrors((current) => ({ ...current, [id]: message }))
  }, [resolveReady, sessionEnded, updateURLs])

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

  const reset = useCallback(() => {
    for (const handle of handlesRef.current.values()) void handle.disconnect()
    handlesRef.current.clear()
    updateSessions([])
    activeRef.current = undefined
    setActiveSessionState(undefined)
    updateURLs(() => ({}))
    setConnectionErrors({})
    activityRef.current = {}
    clearSessions()
  }, [updateSessions, updateURLs])

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
    const persist = () => saveSessions({ ids: sessions, active: activeSession, activity: activityRef.current })
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
    idleClosed,
    clearIdleClosed: () => setIdleClosed(""),
    open,
    close,
    reconnect,
    ended,
    ready: resolveReady,
    activity: markActivity,
    registerHandle,
    showKeyboard,
    sendKeys,
    reset,
  }
}

function omitKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}
