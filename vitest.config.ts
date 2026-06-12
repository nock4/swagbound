import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/node_modules/**", "phaser-4.1.0/**", "external/**", "CoilSnake-master/**"]
  }
});
