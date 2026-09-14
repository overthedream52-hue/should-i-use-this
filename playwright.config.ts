import { defineConfig, devices } from "@playwright/test";
const evidencePort = process.env.EVIDENCE_E2E_PORT;
const baseURL = `http://127.0.0.1:${evidencePort ?? "3000"}`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: evidencePort
      ? `npm run start -- --port ${Number(evidencePort)}`
      : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
