import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests. Expect the API (seeded sandbox) on :4000 and the web app on :3000:
 *   pnpm db:start && pnpm --filter @wasitx/api build && pnpm db:seed
 *   pnpm --filter @wasitx/api start  &  pnpm --filter @wasitx/web build && pnpm --filter @wasitx/web start
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: process.env.WEB_URL ?? "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
