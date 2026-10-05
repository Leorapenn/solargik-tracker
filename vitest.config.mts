import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30000, // queries hit a remote Neon DB, not local
    hookTimeout: 90000, // beforeAll/afterAll create and delete whole projects over the network
  },
});
