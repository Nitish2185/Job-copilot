import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { GITHUB_REPO } from "@job-copilot/shared/config";

// GitHub Pages serves project sites under /<repo>/; the feed is copied to /<repo>/feed/.
export default defineConfig({
  base: `/${GITHUB_REPO}/`,
  plugins: [react(), tailwindcss()],
});
