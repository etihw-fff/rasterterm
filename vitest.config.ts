import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["**/*.{test,spec}.ts", "**/*.d.ts", "**/{test,tests,__tests__,__mocks__}/**"],
    },
  },
});
