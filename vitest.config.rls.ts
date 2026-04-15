import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: false,
    include: ["supabase/tests/rls/**/*.test.ts"],
    testTimeout: 30000,
    fileParallel: false,
  },
});
