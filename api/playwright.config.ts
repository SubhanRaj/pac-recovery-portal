import { defineConfig, devices } from "@playwright/test";

// Points at the live custom domain by default so tests exercise the real production Worker.
// Override with E2E_BASE_URL to point at a local `wrangler`/OpenNext preview instead — same
// app serves everything now (no more cross-origin frontend/API split to reproduce).
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://excisebakaya.exciseup.in",
    trace: "retain-on-failure",
    // Headless: this runs in a sandboxed/non-interactive environment with no window
    // server. Drop HEADLESS=false locally if you want to watch it run.
    headless: process.env.HEADED !== "1",
  },
  projects: [
    {
      name: "chrome",
      // Real installed Chrome, not Playwright's bundled Chromium — matches what users
      // actually run, including third-party cookie behavior.
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
});
