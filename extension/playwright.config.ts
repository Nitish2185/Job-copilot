import { defineConfig } from "@playwright/test";

// End-to-end tests load the e2e build (pnpm build:e2e) into Chromium. They talk
// only to local fixture servers and routed fixtures, never to real job sites.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
});
