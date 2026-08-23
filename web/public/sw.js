const CACHE = "awsl-remotex-shell-v3"
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
})

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/guacamole/")) return

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")))
    return
  }

  event.respondWith(
    fetch(request).then((response) => {
      const copy = response.clone()
      caches.open(CACHE).then((cache) => cache.put(request, copy))
      return response
    }).catch(() => caches.match(request)),
  )
})
