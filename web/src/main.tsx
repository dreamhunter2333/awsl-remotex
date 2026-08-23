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
document.documentElement.dataset.touchDevice = String(touchDevice)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </StrictMode>,
)
