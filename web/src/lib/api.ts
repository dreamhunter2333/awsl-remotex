export type Protocol = "ssh" | "rdp" | "vnc"
export type CredentialType = "prompt" | "password" | "private-key"

export interface VNCSettings {
  encodings?: "tight"
  colorDepth?: 8 | 16 | 24 | 32
  cursor?: "remote"
  wheelDirection?: "reverse"
  clipboardEncoding?: "UTF-8"
}

export interface AssetSettings {
  vnc?: VNCSettings
}

export interface Asset {
  id: string
  name: string
  group: string
  protocol: Protocol
  host: string
  port: number
  username: string
  settings?: AssetSettings
  credentialType: CredentialType
  credentialConfigured: boolean
  createdAt: string
  updatedAt: string
}

export interface AssetInput {
  name: string
  group: string
  protocol: Protocol
  host: string
  port: number
  username: string
  settings?: AssetSettings
  credentialType: CredentialType
  password?: string
  privateKey?: string
  passphrase?: string
}

export interface ConnectionTicket {
  url: string
  expiresAt: string
}

export interface AuthStatus {
  required: boolean
  authenticated: boolean
  oidc?: boolean
  sessionExpiresInMs?: number
  sessionIdleSeconds: number
}

export interface ConnectionTest {
  reachable: boolean
  latencyMs: number
  message: string
}

const sessionKey = "awsl-remotex.jwt"
const oidcKey = "awsl-remotex.oidc"
let oidcCallback: Promise<void> | undefined

export const sessionExpiredEvent = "awsl-remotex:session-expired"

export function expireSession() {
  sessionStorage.removeItem(sessionKey)
  window.dispatchEvent(new Event(sessionExpiredEvent))
}

export async function fetchWithSession(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  const token = globalThis.sessionStorage?.getItem(sessionKey)
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const response = await fetch(path, { ...init, headers, credentials: "omit" })
  if (token && response.status === 401 && response.headers.get("WWW-Authenticate") === "Bearer" &&
    sessionStorage.getItem(sessionKey) === token) {
    expireSession()
  }
  return response
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set("Content-Type", "application/json")
  const response = await fetchWithSession(path, { ...init, headers })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || `请求失败：${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

async function signIn(path: string, input: object) {
  const result = await request<{ token: string } | undefined>(path, { method: "POST", body: JSON.stringify(input) })
  if (result) sessionStorage.setItem(sessionKey, result.token)
}

export async function startOIDC() {
  const { url, ...authorization } = await request<{ url: string; state: string; verifier: string; nonce: string }>(
    "/api/auth/oidc/start", { method: "POST" },
  )
  sessionStorage.setItem(oidcKey, JSON.stringify(authorization))
  window.location.assign(url)
}

export function completeOIDC() {
  if (oidcCallback) return oidcCallback
  if (window.location.pathname !== "/auth/callback") return Promise.resolve()
  oidcCallback = (async () => {
    const parameters = new URLSearchParams(window.location.search)
    const stored = sessionStorage.getItem(oidcKey)
    sessionStorage.removeItem(oidcKey)
    window.history.replaceState(null, "", "/")
    const authorization = stored ? JSON.parse(stored) as { state: string; verifier: string; nonce: string } : undefined
    const code = parameters.get("code")
    if (!authorization || parameters.get("state") !== authorization.state || !code || parameters.has("error")) {
      throw new Error("Invalid OIDC callback")
    }
    await signIn("/api/auth/oidc/exchange", { code, verifier: authorization.verifier, nonce: authorization.nonce })
  })().finally(() => { oidcCallback = undefined })
  return oidcCallback
}

export const api = {
  authStatus: () => request<AuthStatus>("/api/auth/status"),
  login: (username: string, password: string) => signIn("/api/auth/login", { username, password }),
  logout: async () => {
    await request<void>("/api/auth/session", { method: "DELETE", signal: AbortSignal.timeout(10_000) })
    sessionStorage.removeItem(sessionKey)
  },
  tunnelTicket: async (signal: AbortSignal) => {
    if (!globalThis.sessionStorage?.getItem(sessionKey)) return undefined
    return (await request<{ token: string } | undefined>("/api/auth/tunnel", { method: "POST", signal }))?.token
  },
  listAssets: () => request<Asset[]>("/api/assets"),
  createAsset: (input: AssetInput) =>
    request<Asset>("/api/assets", { method: "POST", body: JSON.stringify(input) }),
  updateAsset: (id: string, input: AssetInput) =>
    request<Asset>(`/api/assets/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  connectAsset: (id: string, theme: "dark" | "light", signal?: AbortSignal) =>
    request<ConnectionTicket>(`/api/assets/${id}/connect?theme=${theme}`, { method: "POST", signal }),
  testAsset: (asset: AssetInput, assetId?: string) =>
    request<ConnectionTest>("/api/assets/test", { method: "POST", body: JSON.stringify({ assetId, asset }) }),
  deleteAsset: (id: string) => request<void>(`/api/assets/${id}`, { method: "DELETE" }),
}
