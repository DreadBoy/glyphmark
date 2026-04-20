import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/web/test/visual/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
