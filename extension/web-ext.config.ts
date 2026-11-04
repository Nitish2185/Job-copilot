import { resolve } from "node:path";
import { defineWebExtConfig } from "wxt";

// Dev browser launch settings. `pnpm dev` keeps one Chrome profile in
// extension/.wxt/chrome-data, so the extension's data (profile, jobs, settings)
// survives restarts. The path must be absolute (Windows), and keepProfileChanges
// makes the launcher use that folder instead of a throwaway copy.
// Delete the folder to start fresh.
export default defineWebExtConfig({
  chromiumProfile: resolve(".wxt/chrome-data"),
  keepProfileChanges: true,
});
