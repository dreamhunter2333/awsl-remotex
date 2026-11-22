import type { Status } from "guacamole-common-js"

import { fetchWithSession } from "./api"
import { GuacamoleSDKError } from "./guacamole-sdk"

export interface GuacamoleAuthResponse {
  authToken: string
  dataSource: string
}

export type GuacamoleFailure = "sdk" | "authentication" | "forbidden" | "dns" | "certificate" | "security" | "timeout" | "busy" | "conflict" | "upstream" | "disconnected"

export class GuacamoleSessionError extends Error {
  constructor(readonly failure: GuacamoleFailure, message: string) {
    super(message)
  }
}

export function readGuacamoleTicket(connectionURL: string) {
  return new URL(connectionURL, window.location.origin).searchParams.get("data") ?? ""
}

export async function authenticateGuacamole(ticket: string, signal: AbortSignal): Promise<GuacamoleAuthResponse> {
  const response = await fetchWithSession("/guacamole/api/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: ticket }),
    signal,
  })
  if (!response.ok) {
    const failure = response.status === 401 ? "authentication"
      : response.status === 403 ? "forbidden"
        : response.status === 408 ? "timeout"
          : response.status === 409 ? "conflict"
            : response.status === 429 ? "busy"
              : response.status >= 500 ? "upstream" : "authentication"
    throw new GuacamoleSessionError(failure, `Guacamole authentication failed (${response.status})`)
  }
  const result = await response.json() as Partial<GuacamoleAuthResponse>
  if (!result.authToken || !result.dataSource) throw new GuacamoleSessionError("upstream", "Guacamole returned an invalid authentication response")
  return { authToken: result.authToken, dataSource: result.dataSource }
}

export function buildGuacamoleConnectData(options: {
  connectionID: string
  authToken: string
  dataSource: string
  tunnelTicket?: string
  width: number
  height: number
  dpi: number
  audio: readonly string[]
  video: readonly string[]
}) {
  const parameters = new URLSearchParams({
    token: options.authToken,
    GUAC_DATA_SOURCE: options.dataSource,
    GUAC_ID: options.connectionID,
    GUAC_TYPE: "c",
    GUAC_WIDTH: String(options.width),
    GUAC_HEIGHT: String(options.height),
    GUAC_DPI: String(options.dpi),
    GUAC_TIMEZONE: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })
  if (options.tunnelTicket) parameters.set("remotex_ticket", options.tunnelTicket)
  for (const mimetype of options.audio) parameters.append("GUAC_AUDIO", mimetype)
  for (const mimetype of options.video) parameters.append("GUAC_VIDEO", mimetype)
  for (const mimetype of ["image/webp", "image/png", "image/jpeg"]) parameters.append("GUAC_IMAGE", mimetype)
  return parameters.toString()
}

export function revokeGuacamoleSession(token: string) {
  if (!token) return Promise.resolve()
  const encoded = encodeURIComponent(token)
  return fetchWithSession(`/guacamole/api/session?token=${encoded}`, {
    method: "DELETE",
    headers: { "Guacamole-Token": token },
    keepalive: true,
    signal: AbortSignal.timeout(3_000),
  }).then(() => undefined, () => undefined)
}

export function classifyGuacamoleFailure(reason: unknown): GuacamoleFailure {
  if (reason instanceof GuacamoleSessionError) return reason.failure
  if (reason instanceof GuacamoleSDKError) return "sdk"

  const status = reason as Partial<Pick<Status, "code" | "message">> | undefined
  const message = status?.message ?? (reason instanceof Error ? reason.message : "")
  if (/certificate|\bcert\b/i.test(message)) return "certificate"
  if (/credssp|security|tls|nla|protocol/i.test(message)) return "security"
  if (/authentication|credentials|password|logon|unauthorized/i.test(message)) return "authentication"
  if (/dns|hostname|resolve|name or service not known/i.test(message)) return "dns"

  switch (status?.code) {
    case 0x0301: return "authentication"
    case 0x0303: return "forbidden"
    case 0x0202:
    case 0x020a:
    case 0x0308: return "timeout"
    case 0x0201:
    case 0x031d: return "busy"
    case 0x0204:
    case 0x0207: return "dns"
    case 0x0205:
    case 0x0209: return "conflict"
    case 0x0203:
    case 0x0208: return "upstream"
    default: return "disconnected"
  }
}
