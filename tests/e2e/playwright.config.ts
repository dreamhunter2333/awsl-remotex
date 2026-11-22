import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 12_000 },
  outputDir: "/artifacts/results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "/artifacts/report", open: "never" }],
  ],
  use: {
    baseURL: "https://app.remotex.test",
    browserName: "chromium",
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
})
