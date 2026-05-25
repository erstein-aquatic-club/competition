// vitest.config.unit.ts — unit tests needing a real DOM (jsdom). Only *.vitest.{ts,tsx}.
// Everything else runs under node:test (npm test). See docs/plans/2026-05-25-test-runner-unification-design.md
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.vitest.{ts,tsx}"],
    globals: true,
  },
});
