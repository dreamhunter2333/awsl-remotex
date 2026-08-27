const STORAGE_KEY = "awsl-remotex.sessions"

export interface StoredSessions {
  ids: string[]
  active?: string
  activity: Record<string, number>
}

export function loadSessions(): StoredSessions {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Partial<StoredSessions> | null
    if (!value || !Array.isArray(value.ids)) return { ids: [], activity: {} }
    const ids = [...new Set(value.ids.filter((id): id is string => typeof id === "string"))]
    const activity = Object.fromEntries(Object.entries(value.activity ?? {}).filter((entry) => Number.isFinite(entry[1])))
    return { ids, active: ids.includes(value.active ?? "") ? value.active : ids[0], activity }
  } catch {
    return { ids: [], activity: {} }
  }
}

export function saveSessions(value: StoredSessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

export function clearSessions() {
  localStorage.removeItem(STORAGE_KEY)
}
