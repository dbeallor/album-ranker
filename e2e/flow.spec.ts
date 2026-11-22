import { expect, test } from "./fixtures";
import { goViaMenu } from "./menu";

const QUERY = "getz gilberto";
const ANALYTICS_VIEWS = ["Artists", "Years", "Decades", "Eras", "Albums"];

// The e2e database is shared with the other specs and is not reset, so this test asserts on the
// albums it adds and on page headings, never on exact counts.
test("home to add albums, library, play and every rankings view", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Rank the albums you love." })).toBeVisible();
  await goViaMenu(page, "Add albums");
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByRole("heading", { level: 1, name: "Add albums" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Album or artist" }).fill(QUERY);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=getz\+gilberto$/);

  // Add the first two results that are not in the library yet, each under a year of its own.
  const added: string[] = [];
  for (const year of ["1964", "1998"]) {
    const form = page.locator("form", { has: page.getByRole("button", { name: "Add to library" }) }).first();
    const title = (await form.locator("xpath=ancestor::li[1]").locator("strong").first().textContent()) ?? "";
    await form.getByLabel("Year in your library").fill(year);
    await form.getByRole("button", { name: "Add to library" }).click();
    await expect(page.getByRole("status").filter({ hasText: `Added ${title} to your library.` })).toBeVisible();
    added.push(title);
  }

  await page.getByRole("link", { name: "View library" }).click();
  await expect(page).toHaveURL(/\/library\?sort=year$/);
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /^\d{4} · \d+ albums?$/ }).first()).toBeVisible();
  for (const title of added) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }

  await goViaMenu(page, "Play");
  await expect(page).toHaveURL(/\/matchups$/);
  await expect(page.getByRole("heading", { level: 1, name: "Play" })).toBeVisible();
  const played = page.getByText(/^\d+ matchups played$/);
  const countBefore = Number((await played.textContent())!.split(" ")[0]);
  await page.getByRole("button", { name: "I like this more" }).first().click();
  await expect.poll(async () => Number((await played.textContent())!.split(" ")[0])).toBe(countBefore + 1);

  await goViaMenu(page, "Rankings");
  await expect(page.getByRole("heading", { level: 1, name: "Rankings" })).toBeVisible();
  for (const view of ANALYTICS_VIEWS) {
    await page.getByRole("navigation", { name: "Analytics view" }).getByRole("link", { name: view }).click();
    await expect(page).toHaveURL(new RegExp(`view=${view.toLowerCase()}`));
    await expect(page.getByRole("heading", { level: 1, name: "Rankings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
    await expect(page.getByRole("table")).toBeVisible();
  }
});
