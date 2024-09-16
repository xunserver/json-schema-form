import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.tsx",
      "packages/adapter/*/src/**/*.test.ts",
      "packages/adapter/*/src/**/*.test.tsx",
      "examples/shared/src/**/*.test.ts",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    exclude: ["node_modules", "dist", "packages/*/dist", "packages/adapter/*/dist", "tests/v1/host/**"],
    testTimeout: 30_000,
  },
});
