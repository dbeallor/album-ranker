import { expect, type Page } from "@playwright/test";

/** Opens the overlay menu and follows one of its links. The link closes the menu. */
export async function goViaMenu(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: "Menu" }).click();
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: label }).click();
  await expect(nav).toBeHidden();
}
