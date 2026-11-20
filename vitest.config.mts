import path from "node:path";
import { defineConfig } from "vitest/config";

const root = process.cwd();

export default defineConfig({
  root,
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // "server-only" throws outside a React Server environment; stub it for unit tests.
      "server-only": path.resolve(root, "tests/support/server-only.ts"),
    },
  },
});
