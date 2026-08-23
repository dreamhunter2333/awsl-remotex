import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? process.env.GITHUB_REF_NAME ?? "dev"),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Awsl RemoteX",
        short_name: "RemoteX",
        description: "A lightweight browser-based remote workspace for SSH, RDP, and VNC.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#282c34",
        theme_color: "#282c34",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{js,css,html,woff2,svg}"],
        globIgnores: ["icon.svg"],
        navigateFallbackDenylist: [/^\/api\//, /^\/guacamole\//],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/guacamole": "http://localhost:8080",
    },
  },
})
