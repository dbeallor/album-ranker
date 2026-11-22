import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { openDatabase } from "../lib/db/connection.ts";
import { createImportReviewItem } from "../lib/db/import-review.ts";

// "Use this album" accepts only UUID catalog ids, so each title gets a UUID made from it.
const uuidFor = (text: string) => createHash("md5").update(text).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, "$1-$2-$3-$4-$5");

const candidate = (title: string, year: number) => ({
  catalogId: uuidFor(title),
  title,
  artist: "E2E Artist",
  artistId: uuidFor("E2E Artist"),
  releaseYear: year,
  coverUrl: null,
});

// The app's database is the file the e2e server was started with (see playwright.config.ts). The review items are
// seeded straight into it, so the test never calls the catalog.
function seed(titles: [string, number][]) {
  const db = openDatabase("test-results/db/e2e.db");
  for (const [title, year] of titles) {
    createImportReviewItem(db, {
      source: { title, artist: "E2E Artist", year },
      sourcePlacement: "listed",
      reason: "ambiguous",
      candidates: [candidate(title, year)],
    });
  }
  db.close();
}

test("a click on Use this album takes the item off the page and says so, and a second click is harmless", async ({
  browser,
}) => {
  seed([
    ["Review One", 1990],
    ["Review Two", 1991],
    ["Review Three", 1992],
  ]);
  const context = await browser.newContext();
  const page = await context.newPage();
  const stale = await context.newPage();
  await page.goto("/import");
  await stale.goto("/import");

  const heading = (name: string) => page.getByRole("heading", { level: 3, name: new RegExp(`^${name} `) });
  await expect(heading("Review One")).toBeVisible();
  await expect(page.getByText("3 left", { exact: true })).toBeVisible();

  // The first item is handled with the page already on /import, the URL the old redirect went back to.
  const firstCard = page.getByRole("listitem").filter({ has: heading("Review One") });
  await firstCard.getByRole("button", { name: "Use this album" }).click();

  await expect(heading("Review One")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Added Review One (1990) to your library. 2 left.");
  await expect(page).toHaveURL(/\/import\?done=\d+#item-\d+$/);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);

  // A fast second click: this page still shows the first item, as a double click would have.
  await stale.getByRole("listitem").filter({ hasText: "Review One" }).getByRole("button", { name: "Use this album" }).click();
  await expect(stale.getByRole("status")).toHaveText("Review One was already handled. 2 left.");
  await expect(stale.locator("main").getByRole("alert")).toHaveCount(0);
  await expect(stale.getByRole("heading", { level: 3, name: /^Review One / })).toHaveCount(0);

  // Skipping works the same way and a double click on one page raises no error.
  const secondCard = page.getByRole("listitem").filter({ has: heading("Review Two") });
  await secondCard.getByRole("button", { name: "Skip" }).dblclick();
  await expect(page.getByRole("status")).toHaveText(/^Skipped Review Two\. 1 left\.$|^Review Two was already handled\. 1 left\.$/);
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await context.close();
});
