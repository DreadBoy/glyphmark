import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["libs/core/test/**/*.test.ts"],
  },
});