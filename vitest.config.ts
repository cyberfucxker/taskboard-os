import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests run in Node (no DOM, no Next runtime). We alias `@/` to `src/`
// so tests can import the same modules the app does.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});