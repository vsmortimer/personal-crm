// End-to-end tests: a real browser against the production build of the app
// and a real Postgres in Docker, with no mocks. Usage: pnpm test:e2e
import { defineConfig, devices } from "@playwright/test";

import { E2E_DATABASE_SUFFIX, testDatabaseUrl } from "./test/test-database";

// Not 3000, so a running `pnpm dev` with the app's own database is never used
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  // The tests share one database, so they run one at a time
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  // Creates the e2e database once the app is up, see webServer
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Kept for failed tests only: pnpm exec playwright show-report
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    // Waits for the port, not for a page: pages need the database,
    // and Playwright runs globalSetup only after the server is up
    port: PORT,
    // Never test a server started by hand: it may use another database
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL: testDatabaseUrl(E2E_DATABASE_SUFFIX),
      NEXT_TELEMETRY_DISABLED: "1",
      // Sign-in for the tests. The link in an email leads to this address, and
      // the emails go to Mailpit and nowhere else: whatever the .env says, the
      // tests never send a real email. Not secrets, they protect nothing.
      BETTER_AUTH_SECRET: "Hs8Lw3Nq7Vb2Tk9Xc4Rj6Mf5Pd1Yg0Ae",
      BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
      SMTP_URL: "smtp://127.0.0.1:1025",
      MAIL_FROM: "Личная CRM <noreply@mail.crm.app.example-crm.site>",
    },
  },
});
