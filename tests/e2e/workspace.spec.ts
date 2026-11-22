import { randomUUID } from "node:crypto"
import { expect, test, type APIRequestContext, type Page } from "@playwright/test"

const login = { username: "e2e", password: "fixture-app-password" }
const desktop = "http://desktop:8000"
const protocols = {
  ssh: { port: 22, username: "fixture", password: "fixture-password" },
  vnc: { port: 5900, username: "", password: "fixture" },
  rdp: { port: 3389, username: "fixture", password: "fixture-password" },
} as const
type Protocol = keyof typeof protocols

function fixtureAsset(protocol: Protocol, password: string = protocols[protocol].password) {
  return {
    ...protocols[protocol],
    password,
    protocol,
    name: `${protocol.toUpperCase()} fixture ${randomUUID().slice(0, 8)}`,
    group: "E2E fixtures",
    host: "desktop",
    credentialType: "password",
    settings: protocol === "vnc" ? {
      vnc: { encodings: "tight", colorDepth: 16, cursor: "remote", wheelDirection: "reverse", clipboardEncoding: "UTF-8" },
    } : {},
  }
}

async function apiSession(request: APIRequestContext) {
  const response = await request.post("/api/auth/login", { data: login })
  expect(response.status()).toBe(200)
  const { token } = await response.json()
  return { Authorization: `Bearer ${token}` }
}

async function createAsset(request: APIRequestContext, headers: Record<string, string>, data: ReturnType<typeof fixtureAsset>) {
  const response = await request.post("/api/assets", { headers, data })
  expect(response.status(), await response.text()).toBe(201)
  const asset = await response.json()
  expect(asset).not.toHaveProperty("password")
  expect(asset.credentialConfigured).toBe(true)
  return asset.id as string
}

async function signIn(page: Page) {
  await page.goto("/")
  await page.getByLabel("Username").fill(login.username)
  await page.getByLabel("Password", { exact: true }).fill(login.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()
}

function assetButton(page: Page, name: string) {
  return page.locator("#asset-sidebar").getByRole("button", { name, exact: false })
}

function clipboardButton(page: Page) {
  return page.getByRole("button", { name: "Clipboard", exact: true })
}

async function expectConnected(page: Page, name: string) {
  await expect(page.getByRole("tab", { name, exact: false })).toHaveAttribute("aria-selected", "true")
  await expect(clipboardButton(page)).toBeEnabled()
  await expect(page.getByRole("tabpanel").locator("canvas").first()).toBeVisible()
}

function watchTunnels(page: Page) {
  const frames: string[] = []
  let opened = 0
  let closed = 0
  page.on("websocket", (socket) => {
    if (!new URL(socket.url()).pathname.endsWith("/websocket-tunnel")) return
    opened++
    socket.on("framesent", ({ payload }) => frames.push(payload.toString()))
    socket.on("close", () => { closed++ })
  })
  return { frames, opened: () => opened, closed: () => closed }
}

test("password login, server-side revocation, and anonymous mode", async ({ page, request, playwright }) => {
  expect((await request.get("/api/assets")).status()).toBe(401)
  await page.goto("/")
  await page.getByLabel("Username").fill(login.username)
  await page.getByLabel("Password", { exact: true }).fill("incorrect")
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("alert")).toHaveText("Incorrect username or password")
  await page.getByLabel("Password", { exact: true }).fill(login.password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible()

  const token = await page.evaluate(() => sessionStorage.getItem("awsl-remotex.jwt"))
  expect(token?.split(".")).toHaveLength(3)
  expect(await page.context().cookies()).toEqual([])
  const headers = { Authorization: `Bearer ${token}` }
  const status = await (await request.get("/api/auth/status", { headers })).json()
  expect(status).toMatchObject({ authenticated: true, required: true, oidc: false })
  expect(status.sessionExpiresInMs).toBeGreaterThan(0)

  expect((await request.delete("/api/auth/session", { headers })).status()).toBe(204)
  expect((await request.get("/api/assets", { headers })).status()).toBe(401)
  const addAsset = page.getByRole("main").getByRole("button", { name: "Add asset" })
  await addAsset.click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name", { exact: true }).fill("revoked session")
  await dialog.getByLabel("Host", { exact: true }).fill("desktop")
  await dialog.getByRole("button", { name: "Add asset" }).click()
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem("awsl-remotex.jwt"))).toBeNull()

  const anonymous = await playwright.request.newContext({ baseURL: "http://open-app:8080" })
  try {
    const response = await anonymous.get("/api/auth/status")
    expect(await response.json()).toMatchObject({ required: false, authenticated: true })
    expect((await anonymous.get("/api/assets")).status()).toBe(200)
    expect((await anonymous.post("/api/auth/tunnel")).status()).toBe(204)
  } finally {
    await anonymous.dispose()
  }
})

test("Tinyauth OIDC signs in and issues a cookie-free RemoteX JWT", async ({ page, request }) => {
  const app = "https://oidc.remotex.test"
  expect((await request.get(`${app}/api/assets`)).status()).toBe(401)
  await page.goto(app)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await expect(page).toHaveURL(/^https:\/\/auth\.remotex\.test\//)
  await page.getByLabel("Username").fill(login.username)
  await page.getByLabel("Password", { exact: true }).fill("fixture-oidc-password")
  await page.getByRole("button", { name: "Login", exact: true }).click()
  const authorize = page.getByRole("button", { name: "Authorize", exact: true }).and(page.locator("button:enabled"))
  const signOut = page.getByRole("button", { name: "Sign out" })
  await expect(authorize.or(signOut)).toBeVisible()
  if (await authorize.isVisible()) await authorize.click()
  await expect(page).toHaveURL(`${app}/`)
  await expect(signOut).toBeVisible()

  const token = await page.evaluate(() => sessionStorage.getItem("awsl-remotex.jwt"))
  expect(token?.split(".")).toHaveLength(3)
  expect(await page.context().cookies(app)).toEqual([])
  const headers = { Authorization: `Bearer ${token}` }
  expect(await (await request.get(`${app}/api/auth/status`, { headers })).json()).toMatchObject({ required: true, authenticated: true, oidc: true })

  await signOut.click()
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible()
  await expect.poll(async () => (await request.get(`${app}/api/assets`, { headers })).status()).toBe(401)
})

test("asset CRUD, connection probe, sidebar, theme, and settings", async ({ page, request }) => {
  const headers = await apiSession(request)
  const asset = fixtureAsset("ssh")
  let id: string | undefined
  try {
    await signIn(page)
    await page.locator("#asset-sidebar").getByRole("button", { name: "Add asset" }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Name", { exact: true }).fill(asset.name)
    await dialog.getByLabel("Group", { exact: true }).fill(asset.group)
    await dialog.getByLabel("Host", { exact: true }).fill("missing.invalid")
    await dialog.getByLabel("Username", { exact: true }).fill(asset.username)
    await dialog.getByRole("button", { name: "Saved password" }).click()
    await dialog.getByLabel("Connection password").fill(asset.password)
    await dialog.getByRole("button", { name: "Test connection" }).click()
    await expect(dialog.getByRole("status")).toContainText("Connection failed")
    await dialog.getByLabel("Host", { exact: true }).fill(asset.host)
    await expect(dialog.getByRole("status")).toBeEmpty()
    await dialog.getByRole("button", { name: "Test connection" }).click()
    await expect(dialog.getByRole("status")).toContainText("Connected in")
    const created = page.waitForResponse((response) => response.url().endsWith("/api/assets") && response.request().method() === "POST")
    await dialog.getByRole("button", { name: "Add asset" }).click()
    const response = await created
    expect(response.status()).toBe(201)
    id = (await response.json()).id

    const filter = page.getByRole("textbox", { name: "Filter connections…" })
    await filter.fill("no matching fixture")
    await expect(assetButton(page, asset.name)).toHaveCount(0)
    await filter.fill("")
    await expect(assetButton(page, asset.name)).toBeVisible()
    const toggle = page.locator('main button[aria-controls="asset-sidebar"]')
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-expanded", "false")
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-expanded", "true")
    const ref = assetButton(page, asset.name).locator("..")
    await ref.getByRole("button", { name: "Edit asset" }).click()
    const renamed = `${asset.name} renamed`
    await dialog.getByLabel("Name", { exact: true }).fill(renamed)
    await dialog.getByRole("button", { name: "Save changes" }).click()
    await expect(assetButton(page, renamed)).toBeVisible()
    await page.getByRole("combobox", { name: "Theme" }).click()
    await page.getByRole("option", { name: "Light" }).click()
    await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "light")
    await page.reload()
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light")

    await assetButton(page, renamed).dblclick()
    await expectConnected(page, renamed)
    await assetButton(page, renamed).locator("..").getByRole("button", { name: "Edit asset" }).click()
    page.once("dialog", (confirmation) => confirmation.accept())
    await dialog.getByRole("button", { name: "Delete connection" }).click()
    await expect(assetButton(page, renamed)).toHaveCount(0)
    await expect(page.getByText("No open sessions")).toBeVisible()
  } finally {
    if (id) await request.delete(`/api/assets/${id}`, { headers })
  }
})

for (const protocol of ["ssh", "vnc", "rdp"] as const) {
  test(`${protocol.toUpperCase()} connects, renders, sends input, resizes, and reconnects`, async ({ page, request }) => {
    const headers = await apiSession(request)
    const asset = fixtureAsset(protocol)
    const id = await createAsset(request, headers, asset)
    const tunnels = watchTunnels(page)
    try {
      await signIn(page)
      if (protocol === "vnc") {
        await assetButton(page, asset.name).locator("..").getByRole("button", { name: "Edit asset" }).click()
        const dialog = page.getByRole("dialog")
        await expect(dialog.getByRole("checkbox", { name: /Use custom VNC parameters/ })).toBeChecked()
        for (const value of ["Tight JPEG", "16-bit", "Server-rendered", "Reverse", "UTF-8"]) {
          await expect(dialog.getByRole("combobox").filter({ hasText: value })).toBeVisible()
        }
        await dialog.getByRole("button", { name: "Cancel" }).click()
      }
      await assetButton(page, asset.name).dblclick()
      await expectConnected(page, asset.name)
      await page.getByRole("tabpanel").locator("textarea").focus()
      const beforeKey = tunnels.frames.length
      await page.keyboard.press("a")
      await expect.poll(() => tunnels.frames.slice(beforeKey).some((frame) => frame.includes("3.key"))).toBe(true)

      const beforeResize = tunnels.frames.length
      const canvas = page.getByRole("tabpanel").locator("canvas").first()
      const originalWidth = await canvas.evaluate((element: HTMLCanvasElement) => element.width)
      await page.setViewportSize({ width: 1180, height: 760 })
      await expect.poll(() => tunnels.frames.slice(beforeResize).some((frame) => frame.includes("4.size"))).toBe(true)
      if (protocol === "rdp") {
        await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.width)).toBeLessThan(originalWidth)
      }

      await clipboardButton(page).click()
      const dialog = page.getByRole("dialog", { name: "Clipboard" })
      const beforeClipboard = tunnels.frames.length
      await dialog.getByRole("textbox", { name: "Clipboard" }).fill("RemoteX E2E clipboard")
      await expect.poll(() => tunnels.frames.slice(beforeClipboard).some((frame) => frame.includes("9.clipboard"))).toBe(true)
      await dialog.getByRole("button", { name: "Close" }).click()

      await page.getByRole("button", { name: "Reconnect" }).click()
      await expect.poll(tunnels.opened).toBe(2)
      await expectConnected(page, asset.name)
      await page.getByRole("button", { name: "Sign out" }).click()
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible()
      await expect.poll(tunnels.closed).toBe(2)
    } finally {
      await request.delete(`/api/assets/${id}`, { headers })
    }
  })
}

test("RDP connection probe reports reachability without verifying a rejected password", async ({ page, request }) => {
  const headers = await apiSession(request)
  const asset = fixtureAsset("rdp", "wrong")
  const id = await createAsset(request, headers, asset)
  try {
    const { failed } = await (await request.get(`${desktop}/rdp`)).json()
    await signIn(page)
    await assetButton(page, asset.name).locator("..").getByRole("button", { name: "Edit asset" }).click()
    const dialog = page.getByRole("dialog")
    const probed = page.waitForResponse((response) => response.url().endsWith("/api/assets/test"))
    await dialog.getByRole("button", { name: "Test connection" }).click()
    expect(await (await probed).json()).toMatchObject({ reachable: true, loginUnverified: true })
    await expect(dialog.getByRole("status")).toContainText("Open a session to verify sign-in")
    await expect.poll(async () => (await (await request.get(`${desktop}/rdp`)).json()).failed).toBe(failed + 1)
    await dialog.getByLabel("Connection password").fill(protocols.rdp.password)
    await expect(dialog.getByRole("status")).toBeEmpty()

    const saved = await request.post(`/api/assets/${id}/test`, { headers })
    expect(await saved.json()).toMatchObject({ reachable: true, loginUnverified: true })
    await expect.poll(async () => (await (await request.get(`${desktop}/rdp`)).json()).failed).toBe(failed + 2)
  } finally {
    await request.delete(`/api/assets/${id}`, { headers })
  }
})

for (const protocol of ["vnc", "rdp"] as const) {
  test(`${protocol.toUpperCase()} handles invalid credentials and recovers after updating them`, async ({ page, request }) => {
    const headers = await apiSession(request)
    const asset = fixtureAsset(protocol, "wrong")
    const id = await createAsset(request, headers, asset)
    try {
      await signIn(page)
      const rdpBefore = protocol === "rdp" ? await (await request.get(`${desktop}/rdp`)).json() : undefined
      await assetButton(page, asset.name).dblclick()
      const failure = page.getByRole("alertdialog")
      if (rdpBefore) {
        await expect.poll(async () => (await request.get(`${desktop}/rdp`)).json()).toEqual({ ...rdpBefore, failed: rdpBefore.failed + 1 })
      } else {
        await expect(failure).toBeVisible()
        await expect(clipboardButton(page)).toBeDisabled()
      }

      await assetButton(page, asset.name).locator("..").getByRole("button", { name: "Edit asset" }).click()
      const dialog = page.getByRole("dialog")
      await dialog.getByLabel("Connection password").fill(protocols[protocol].password)
      await dialog.getByRole("button", { name: "Save changes" }).click()
      await expect(dialog).toBeHidden()
      const toolbar = page.getByRole("main")
      await (rdpBefore ? toolbar : failure).getByRole("button", { name: "Reconnect" }).click()
      await expectConnected(page, asset.name)
      if (rdpBefore) {
        await expect.poll(async () => (await request.get(`${desktop}/rdp`)).json()).toEqual({ failed: rdpBefore.failed + 1, accepted: rdpBefore.accepted + 1 })
      }
    } finally {
      await request.delete(`/api/assets/${id}`, { headers })
    }
  })
}

for (const protocol of ["vnc", "rdp"] as const) {
  test(`${protocol.toUpperCase()} exchanges clipboard text with the X11 desktop`, async ({ page, request }) => {
    const headers = await apiSession(request)
    const asset = { ...fixtureAsset(protocol), settings: {} }
    const id = await createAsset(request, headers, asset)
    const clipboardURL = `${desktop}/${protocol}/clipboard`
    try {
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
      await signIn(page)
      const rdpBefore = protocol === "rdp" ? await (await request.get(`${desktop}/rdp`)).json() : undefined
      await assetButton(page, asset.name).dblclick()
      await expectConnected(page, asset.name)
      if (rdpBefore) {
        await expect.poll(async () => (await (await request.get(`${desktop}/rdp`)).json()).accepted).toBeGreaterThan(rdpBefore.accepted)
      }
      await clipboardButton(page).click()
      const editor = page.getByRole("dialog", { name: "Clipboard" }).getByRole("textbox", { name: "Clipboard" })
      const localText = `browser ${randomUUID()}`
      await editor.fill(localText)
      await expect.poll(async () => (await request.get(clipboardURL)).text()).toBe(localText)

      const remoteText = `desktop ${randomUUID()}`
      await expect.poll(async () => (await request.put(clipboardURL, { data: remoteText })).status()).toBe(204)
      expect(await (await request.get(clipboardURL)).text()).toBe(remoteText)
      await expect(editor).toHaveValue(remoteText, { timeout: 25_000 })
    } finally {
      await request.delete(`/api/assets/${id}`, { headers })
    }
  })
}

test("VNC and RDP tabs keep their sessions when switching or closing a tab", async ({ page, request }) => {
  const headers = await apiSession(request)
  const vnc = fixtureAsset("vnc")
  const rdp = fixtureAsset("rdp")
  const ids: string[] = []
  const tunnels = watchTunnels(page)
  try {
    ids.push(await createAsset(request, headers, vnc))
    ids.push(await createAsset(request, headers, rdp))
    await signIn(page)
    await assetButton(page, vnc.name).dblclick()
    await expectConnected(page, vnc.name)
    await assetButton(page, rdp.name).dblclick()
    await expectConnected(page, rdp.name)

    await page.getByRole("tab", { name: vnc.name }).click()
    await expectConnected(page, vnc.name)
    expect(tunnels.opened()).toBe(2)
    expect(tunnels.closed()).toBe(0)
    await page.getByRole("button", { name: `Close ${rdp.name}`, exact: true }).click()
    await expect.poll(tunnels.closed).toBe(1)
    await expectConnected(page, vnc.name)
    await page.getByRole("button", { name: "Disconnect", exact: true }).click()
    await expect.poll(tunnels.closed).toBe(2)
    await expect(page.getByText("No open sessions")).toBeVisible()
  } finally {
    for (const id of ids) await request.delete(`/api/assets/${id}`, { headers })
  }
})

test("RDP audio is muted by default, plays on click, and mutes on reconnect", async ({ page, request }) => {
  const headers = await apiSession(request)
  const asset = fixtureAsset("rdp")
  const id = await createAsset(request, headers, asset)
  const tunnels = watchTunnels(page)
  let audioStreams = 0
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      if (payload.toString().includes("5.audio,")) audioStreams++
    })
  })
  await page.addInitScript(() => {
    const counters = { created: 0, played: 0, closed: 0 }
    Object.defineProperty(window, "__audioCounters", { value: counters })
    window.AudioContext = new Proxy(window.AudioContext, {
      construct(target, args) {
        counters.created++
        return Reflect.construct(target, args)
      },
    })
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode["start"]>) {
      start.apply(this, args)
      if (this.buffer?.getChannelData(0).some((sample) => Math.abs(sample) > 0.01)) counters.played++
    }
    const close = AudioContext.prototype.close
    AudioContext.prototype.close = function (this: AudioContext) {
      counters.closed++
      return close.call(this)
    }
  })
  const counters = () => page.evaluate(() => (window as Window & {
    __audioCounters: { created: number; played: number; closed: number }
  }).__audioCounters)
  const playTone = async () => {
    const response = await request.post(`${desktop}/rdp/audio`)
    expect(response.status(), await response.text()).toBe(204)
  }

  try {
    await signIn(page)
    await assetButton(page, asset.name).dblclick()
    await expectConnected(page, asset.name)
    const sound = page.getByRole("button", { name: "Audio", exact: true })
    await expect(sound).toHaveAttribute("aria-pressed", "false")
    await expect.poll(async () => (await request.post(`${desktop}/rdp/audio`)).status()).toBe(204)
    await expect.poll(() => audioStreams).toBeGreaterThan(0)
    expect(await counters()).toEqual({ created: 0, played: 0, closed: 0 })

    await sound.click()
    await expect(sound).toHaveAttribute("aria-pressed", "true")
    await playTone()
    await expect.poll(async () => (await counters()).played).toBeGreaterThan(0)
    await sound.click()
    await expect(sound).toHaveAttribute("aria-pressed", "false")
    const muted = await counters()
    expect(muted).toMatchObject({ created: 1, closed: 1 })
    await playTone()
    expect(await counters()).toEqual(muted)

    await page.setViewportSize({ width: 480, height: 720 })
    await expect(sound).toBeVisible()
    await sound.click()
    await expect(sound).toHaveAttribute("aria-pressed", "true")
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole("button", { name: "Reconnect" }).click()
    await expect.poll(tunnels.opened).toBe(2)
    await expectConnected(page, asset.name)
    await expect(sound).toHaveAttribute("aria-pressed", "false")
    expect(await counters()).toMatchObject({ created: 2, closed: 2 })
  } finally {
    await request.delete(`/api/assets/${id}`, { headers })
  }
})
