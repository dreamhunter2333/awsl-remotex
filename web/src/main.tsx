import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App"
import { PreferencesProvider } from "./lib/preferences"
import "./lib/pwa"
import "./styles.css"

const touchDevice = navigator.maxTouchPoints > 0 && (
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
)
const standalone = window.matchMedia("(display-mode: standalone)").matches
  || (navigator as Navigator & { standalone?: boolean }).standalone === true
document.documentElement.dataset.touchDevice = String(touchDevice)
document.documentElement.dataset.standalone = String(standalone)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </StrictMode>,
)
