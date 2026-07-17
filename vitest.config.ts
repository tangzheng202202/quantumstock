import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Default to node; component/hook tests opt into jsdom per-file via
    // a `// @vitest-environment jsdom` docblock at the top of the file.
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Scope to the testable core business logic. UI, the AI orchestration
      // client, and third-party data adapters are covered by integration
      // tests / manual verification rather than unit coverage.
      include: [
        "src/lib/indicators/**",
        "src/lib/backtest/**",
        "src/lib/cache/**",
        "src/lib/api/**",
        "src/lib/utils.ts",
        "src/lib/stores/**",
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
