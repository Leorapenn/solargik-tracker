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
    testTimeout: 90000, // queries hit a remote Neon DB, not local; creating a project (all phases and items) takes a while, and slower still when two test files run at once
    hookTimeout: 90000, // beforeAll/afterAll create and delete whole projects over the network
  },
});
