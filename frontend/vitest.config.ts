import path from "node:path";
import { defineConfig } from "vitest/config";

// Dedicated Vitest config. The current suite covers pure logic (no DOM), so we
// run in the lightweight `node` environment and avoid loading the Vite React
// plugin. Switch `environment` to "jsdom" (and add the dep) if/when component
// tests are introduced.
export default defineConfig({
  // Mirror the "@" alias from vite.config.ts so tests can import app modules.
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
