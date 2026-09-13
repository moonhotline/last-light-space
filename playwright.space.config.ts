import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/space-escape-ui",
  timeout: 45000,
  workers: 1,
  expect: { timeout: process.env.SPACE_WEB_URL ? 30000 : 10000 },
  use: {
    baseURL: process.env.SPACE_WEB_URL || "http://127.0.0.1:5180",
    proxy: process.env.SPACE_BROWSER_PROXY
      ? { server: process.env.SPACE_BROWSER_PROXY }
      : undefined,
    viewport: { width: 1440, height: 900 },
    // Chromium's default headless software renderer stalls concurrent WebGL pages
    // on macOS. Use the native Metal backend for the real rendering checks.
    launchOptions:
      process.platform === "darwin" ? { args: ["--use-angle=metal"] } : {},
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.SPACE_WEB_URL
    ? undefined
    : [
        {
          command: "npm run space:dev",
          url: "http://127.0.0.1:5180",
          reuseExistingServer: true,
        },
        {
          command: "npm run space:build && npm run space:server",
          url: "http://127.0.0.1:2567/health",
          reuseExistingServer: true,
        },
      ],
});
