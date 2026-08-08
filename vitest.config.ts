import { defineConfig } from "vitest/config";

/**
 * Vitest runs the unit and security suites directly against the source, without
 * the TanStack Start / SSR plugins that only make sense for the app build.
 */
export default defineConfig({
  resolve: {
    alias: { "@": `${process.cwd()}/src` },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/security/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
