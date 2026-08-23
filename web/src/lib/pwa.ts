import { registerSW } from "virtual:pwa-register"

const UPDATE_INTERVAL_MS = 15 * 60 * 1000

registerSW({
  immediate: true,
  onRegisteredSW(swURL, registration) {
    if (!registration) return
    const checkForUpdate = async () => {
      if (registration.installing || !navigator.onLine) return
      try {
        const response = await fetch(swURL, { cache: "no-store" })
        if (response.ok) await registration.update()
      } catch {
        return
      }
    }
    window.setInterval(() => void checkForUpdate(), UPDATE_INTERVAL_MS)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void checkForUpdate()
    })
  },
})
