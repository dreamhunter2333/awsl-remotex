import { useEffect, useState } from "react"

import { activateServiceWorker, SERVICE_WORKER_UPDATE_EVENT } from "@/lib/service-worker"

export function usePWAUpdate() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>()
  useEffect(() => {
    const onUpdate = (event: Event) => setRegistration((event as CustomEvent<ServiceWorkerRegistration>).detail)
    window.addEventListener(SERVICE_WORKER_UPDATE_EVENT, onUpdate)
    return () => window.removeEventListener(SERVICE_WORKER_UPDATE_EVENT, onUpdate)
  }, [])
  return {
    updateAvailable: Boolean(registration),
    applyUpdate: () => registration && activateServiceWorker(registration),
  }
}
