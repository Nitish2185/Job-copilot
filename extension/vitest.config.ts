import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

export default defineConfig({
  // WxtVitest provides the fake `browser` API and the "@/" alias.
  plugins: [WxtVitest()],
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    environment: "node",
  },
});
