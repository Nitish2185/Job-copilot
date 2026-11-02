import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";
import { APP_NAME, GITHUB_OWNER } from "@job-copilot/shared/config";

const GECKO_ID = `job-copilot@${GITHUB_OWNER.toLowerCase()}.github.io`;

// Firefox builds use Manifest V2 (WXT's default); Chrome and Edge use MV3.
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  // Explicit imports keep every file readable without generated globals.
  imports: false,
  manifest: ({ browser }) => ({
    name: APP_NAME,
    description:
      "Free, private job-hunting assistant for developers: finds and ranks jobs, prepares applications, and fills forms.",
    action: { default_title: APP_NAME },
    ...(browser === "firefox" && {
      browser_specific_settings: { gecko: { id: GECKO_ID } },
    }),
  }),
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
