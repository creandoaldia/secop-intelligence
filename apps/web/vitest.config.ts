import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  oxc: {
    jsx: "automatic",
    jsxImportSource: "react",
  } as any,
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx", "components/__tests__/**/*.test.tsx"],
    setupFiles: ["./__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["lib/sena/", "lib/linkedin/", "lib/mercadopago/", "lib/analysis/"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
