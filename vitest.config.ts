import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
config({ path: ".env" });
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || process.env.TEST_DATABASE_RESET !== "yes") {
  throw new Error("Set TEST_DATABASE_URL to a disposable PostgreSQL and TEST_DATABASE_RESET=yes. Tests reset only that database.");
}
const parsed = new URL(testUrl);
if (!/test/i.test(parsed.pathname) || (process.env.DATABASE_URL && parsed.pathname === new URL(process.env.DATABASE_URL).pathname && parsed.host === new URL(process.env.DATABASE_URL).host)) {
  throw new Error("Test database name must contain test and differ from DATABASE_URL.");
}
process.env.DATABASE_URL = testUrl;
process.env.POOL_DATABASE_URL = testUrl;
process.env.DEMO_AUTH_ENABLED = "true";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node", testTimeout: 30000, hookTimeout: 30000,
    fileParallelism: false, maxWorkers: 1,
    globalSetup: ["./tests/globalSetup.ts"],
    coverage: { provider: "v8", reporter: ["text", "html", "json-summary"], include: ["src/services/**/*.ts", "src/lib/rbac.ts", "src/lib/http.ts", "src/lib/model.ts", "src/lib/validation.ts", "src/proxy.ts", "src/app/api/**/*.ts"], thresholds: { lines: 90, functions: 90, statements: 90, branches: 80 } },
  },
});
