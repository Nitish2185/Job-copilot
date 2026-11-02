import { defineWebExtConfig } from "wxt";

// Dev browser launch settings. A persistent profile keeps the extension's
// IndexedDB data between `pnpm dev` runs.
export default defineWebExtConfig({
  chromiumArgs: ["--user-data-dir=./.wxt/chrome-data"],
});
