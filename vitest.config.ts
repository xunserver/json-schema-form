import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const playgroundSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "examples/playground/src");

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": playgroundSrc,
    },
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.tsx",
      "packages/adapter/*/src/**/*.test.ts",
      "packages/adapter/*/src/**/*.test.tsx",
      "examples/shared/src/**/*.test.ts",
      "examples/playground/src/**/*.test.ts",
      "examples/playground/src/**/*.test.tsx",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    exclude: ["node_modules", "dist", "packages/*/dist", "packages/adapter/*/dist", "tests/v1/host/**"],
    testTimeout: 30_000,
  },
});
