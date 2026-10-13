import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  // All tests share one signed-in user and one saved board, so they run one at a time.
  workers: 1,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  // Tests run against the real backend serving the static build (run `npm run build` first).
  webServer: {
    command: "uv run uvicorn app.main:app --host 127.0.0.1 --port 3000",
    cwd: "../backend",
    env: {
      AI_STUB: "1",
      STATIC_DIR: "../frontend/out",
      DB_PATH: path.join(os.tmpdir(), "pm-e2e.db"),
    },
    url: "http://127.0.0.1:3000/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
