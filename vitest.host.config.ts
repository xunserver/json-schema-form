import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    include: ["tests/v1/host/**/*.test.ts", "tests/v1/ssr.test.tsx", "tests/v1/examples.test.ts"],
    exclude: ["node_modules", "dist", "packages/*/dist"],
    testTimeout: 60_000,
  },
});
