import { type Page } from "@playwright/test";

/** Follows one of the page links in the top bar. */
export async function goViaNav(page: Page, label: string): Promise<void> {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label }).click();
}
