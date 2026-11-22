import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3100;
const STUB_PORT = 3101;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "test-results/e2e",
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/catalog-stub.ts",
      url: `http://127.0.0.1:${STUB_PORT}`,
      reuseExistingServer: false,
      env: { CATALOG_STUB_PORT: String(STUB_PORT) },
    },
    {
      // A production build, so the run is stable and checks what ships. Its own port and
      // its own SQLite file under test-results/, never data/. The file is deleted first so every run starts empty.
      command: `rm -rf test-results/db && npm run build && npx next start --hostname 127.0.0.1 --port ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        MUSICBRAINZ_URL: `http://127.0.0.1:${STUB_PORT}`,
        COVER_ART_ARCHIVE_URL: `http://127.0.0.1:${STUB_PORT}`,
        DEEZER_URL: `http://127.0.0.1:${STUB_PORT}`,
        DATABASE_PATH: "test-results/db/e2e.db",
        BACKUP_DIR: "test-results/db/backups",
      },
    },
  ],
});
