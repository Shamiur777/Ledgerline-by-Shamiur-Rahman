import { defineConfig } from "@playwright/test";

// Run against a local Supabase (`npx supabase start`) with the demo seeded (`npm run seed:demo`).
// Locally we drive the Edge that ships with Windows; in CI set E2E_CHANNEL= to use bundled Chromium.
const channel = process.env.E2E_CHANNEL === undefined ? "msedge" : process.env.E2E_CHANNEL || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", channel, trace: "retain-on-failure" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120_000 },
});
