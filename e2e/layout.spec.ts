import { expect, test } from "@playwright/test";

// Routes without an id in the path. /artists/[id] needs one, so the screenshot review covers it. The flow spec runs first, so the database may hold albums.
const ROUTES = ["/", "/search", "/library", "/matchups", "/analytics", "/import"];
const WIDTHS = [
  { name: "phone", width: 375, height: 800 },
  { name: "desktop", width: 1280, height: 800 },
];

test.describe("layout", () => {
  for (const { name, width, height } of WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} at ${width}px (${name}) has the menu and does not scroll sideways`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto(route);

        await page.getByRole("button", { name: "Menu" }).click();
        const nav = page.getByRole("navigation", { name: "Main" });
        await expect(nav).toBeVisible();
        await expect(nav.getByRole("link")).toHaveText(["01Add albums", "02Library", "03Play", "04Rankings"]);
        await expect(nav.getByRole("link", { name: "Import" })).toHaveCount(0);
        await page.getByRole("button", { name: "Close" }).click();
        await expect(nav).toBeHidden();
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          bodyScrollWidth: document.body.scrollWidth,
        }));
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
        expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      });
    }
  }
});
