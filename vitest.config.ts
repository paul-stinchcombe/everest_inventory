/**
 * Vitest configuration for discovering project tests under the test directory.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
