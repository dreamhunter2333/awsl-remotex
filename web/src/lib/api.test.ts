// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"

import { api, completeOIDC } from "./api"

afterEach(() => {
  sessionStorage.clear()
  window.history.replaceState(null, "", "/")
  vi.unstubAllGlobals()
})

it("uses the login JWT for API and tunnel requests and clears it on logout", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ token: "login.jwt" }))
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(Response.json({ token: "tunnel.jwt" }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(Response.json({ authenticated: false }))
  vi.stubGlobal("fetch", fetch)

  await api.login("operator", "password")
  await api.listAssets()
  await expect(api.tunnelTicket(new AbortController().signal)).resolves.toBe("tunnel.jwt")
  await api.logout()
  await api.authStatus()

  for (const [, options] of fetch.mock.calls) expect(options?.credentials).toBe("omit")
  for (const [, options] of fetch.mock.calls.slice(1, 4)) {
    expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer login.jwt")
  }
  expect(new Headers(fetch.mock.calls[4][1]?.headers).get("Authorization")).toBeNull()
})

it("exchanges the OIDC code once and removes it from the browser URL", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({ token: "oidc.jwt" }))
  vi.stubGlobal("fetch", fetch)
  sessionStorage.setItem("awsl-remotex.oidc", JSON.stringify({ state: "expected", verifier: "verifier", nonce: "nonce" }))
  window.history.replaceState(null, "", "/auth/callback?code=one-time-code&state=expected")

  await Promise.all([completeOIDC(), completeOIDC()])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch).toHaveBeenCalledWith("/api/auth/oidc/exchange", expect.objectContaining({
    body: JSON.stringify({ code: "one-time-code", verifier: "verifier", nonce: "nonce" }),
  }))
  expect(sessionStorage.getItem("awsl-remotex.jwt")).toBe("oidc.jwt")
  expect(window.location.pathname + window.location.search).toBe("/")

  sessionStorage.setItem("awsl-remotex.oidc", JSON.stringify({ state: "expected", verifier: "verifier", nonce: "nonce" }))
  window.history.replaceState(null, "", "/auth/callback?code=another-code&state=wrong")
  await expect(completeOIDC()).rejects.toThrow("Invalid OIDC callback")
  expect(fetch).toHaveBeenCalledTimes(1)
})

it("does not discard a newer JWT when an older request fails", async () => {
  let rejectOldToken!: (response: Response) => void
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockReturnValueOnce(new Promise((resolve) => { rejectOldToken = resolve }))
    .mockResolvedValueOnce(Response.json({ token: "new-jwt" }))
  vi.stubGlobal("fetch", fetch)
  sessionStorage.setItem("awsl-remotex.jwt", "old-jwt")

  const rejected = expect(api.listAssets()).rejects.toThrow("authentication required")
  await api.login("operator", "password")
  rejectOldToken(Response.json({ error: "authentication required" }, {
    status: 401, headers: { "WWW-Authenticate": "Bearer" },
  }))

  await rejected
  expect(sessionStorage.getItem("awsl-remotex.jwt")).toBe("new-jwt")
})
