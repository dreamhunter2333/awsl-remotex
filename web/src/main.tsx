import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App"
import { PreferencesProvider } from "./lib/preferences"
import { registerServiceWorker } from "./lib/service-worker"
import "./styles.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PreferencesProvider>
      <App />
    </PreferencesProvider>
  </StrictMode>,
)

registerServiceWorker()
