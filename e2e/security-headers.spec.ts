import { expect, test } from "@playwright/test";
import { securityHeaders } from "../lib/security-headers";

// The e2e server is a production build, so the policy under test is the production one.
test.describe("security headers", () => {
  test("a page response carries each header and no X-Powered-By", async ({ request }) => {
    const response = await request.get("/library");
    const headers = response.headers();

    for (const { key, value } of securityHeaders({ development: false })) {
      expect(headers[key.toLowerCase()], key).toBe(value);
    }
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  for (const route of ["/library", "/matchups"]) {
    test(`${route} loads with no Content Security Policy violation`, async ({ page }) => {
      const consoleMessages: string[] = [];
      page.on("console", (message) => consoleMessages.push(message.text()));
      // Collect the browser's violation events from before the page's own scripts run.
      await page.addInitScript(() => {
        (window as unknown as { violations: string[] }).violations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          (window as unknown as { violations: string[] }).violations.push(`${event.violatedDirective} ${event.blockedURI}`);
        });
      });

      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");

      expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([]);
      expect(consoleMessages.filter((text) => text.includes("Content Security Policy"))).toEqual([]);
    });
  }
});
