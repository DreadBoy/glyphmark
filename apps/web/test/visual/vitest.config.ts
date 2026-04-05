import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/web/test/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
