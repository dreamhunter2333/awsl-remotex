export type Protocol = "ssh" | "rdp" | "vnc"
export type CredentialType = "prompt" | "password" | "private-key"

export interface Asset {
  id: string
  name: string
  group: string
  protocol: Protocol
  host: string
  port: number
  username: string
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
  sessionIdleSeconds: number
}

export interface ConnectionTest {
  reachable: boolean
  latencyMs: number
  message: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || `请求失败：${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const api = {
  authStatus: () => request<AuthStatus>("/api/auth/status"),
  login: (password: string) => request<void>("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request<void>("/api/auth/session", { method: "DELETE" }),
  listAssets: () => request<Asset[]>("/api/assets"),
  createAsset: (input: AssetInput) =>
    request<Asset>("/api/assets", { method: "POST", body: JSON.stringify(input) }),
  updateAsset: (id: string, input: AssetInput) =>
    request<Asset>(`/api/assets/${id}`, { method: "PUT", body: JSON.stringify(input) }),
  connectAsset: (id: string, theme: "dark" | "light") =>
    request<ConnectionTicket>(`/api/assets/${id}/connect?theme=${theme}`, { method: "POST" }),
  testAsset: (asset: AssetInput, assetId?: string) =>
    request<ConnectionTest>("/api/assets/test", { method: "POST", body: JSON.stringify({ assetId, asset }) }),
  deleteAsset: (id: string) => request<void>(`/api/assets/${id}`, { method: "DELETE" }),
}
