import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 40_000,
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:45301",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1024 } } },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:45301/api/health",
    env: { CADENCE_PORT: "45301", CADENCE_HOST: "127.0.0.1" },
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
