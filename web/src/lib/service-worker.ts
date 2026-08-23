export const SERVICE_WORKER_UPDATE_EVENT = "awsl-remotex:update-available"

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return
  window.addEventListener("load", async () => {
    const registration = await navigator.serviceWorker.register("/sw.js")
    const notify = () => window.dispatchEvent(new CustomEvent(SERVICE_WORKER_UPDATE_EVENT, { detail: registration }))
    if (registration.waiting) notify()
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) notify()
      })
    })
  })
}

export function activateServiceWorker(registration: ServiceWorkerRegistration) {
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true })
  registration.waiting?.postMessage({ type: "SKIP_WAITING" })
}
