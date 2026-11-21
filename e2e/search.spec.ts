import { expect, test } from "./fixtures";

const QUERY = "getz gilberto";

test.describe("search page", () => {
test("search for an album", async ({ page, recorded }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Search albums" }).click();
  await expect(page).toHaveURL(/\/search$/);

  await page.getByRole("searchbox", { name: "Album or artist" }).click();
  await page.keyboard.type(QUERY);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/search\?q=getz\+gilberto$/);
  const firstTitle = page.locator("li strong").first();
  await expect(firstTitle).toBeVisible();
  await firstTitle.click();

  // Events reach the test through an async binding, so wait for the last click to land.
  await expect.poll(() => recorded.snapshot().filter((event) => event.type === "click").length).toBeGreaterThanOrEqual(3);
  const events = recorded.snapshot();

  const navigations = events.flatMap((event) => (event.type === "navigation" ? [`${event.kind} ${event.url}`] : []));
  // Next.js also calls replaceState on its own (for example after hydration), so only check these three, in order.
  const wanted = ["load /", "push /search", "load /search?q=getz+gilberto"];
  expect(navigations.filter((navigation) => wanted.includes(navigation))).toEqual(wanted);

  const inputIndexes = events.flatMap((event, index) => (event.type === "input" ? [index] : []));
  const typed = inputIndexes.map((index) => (events[index] as { value: string }).value);
  expect(typed).toEqual(Array.from(QUERY, (_, index) => QUERY.slice(0, index + 1)));

  const lastInput = inputIndexes[inputIndexes.length - 1];
  const secondLoad = events.findIndex((event) => event.type === "navigation" && event.url === "/search?q=getz+gilberto");
  const submit = events.findIndex((event) => event.type === "submit");
  expect(submit).toBeGreaterThan(lastInput);
  expect(submit).toBeLessThan(secondLoad);

  const { source, version, test: title } = recorded.log();
  expect(version).toBe(2);
  expect(title).toBe("search page: search for an album");
  expect(source).toMatchObject({ kind: "playwright", host: "127.0.0.1:3100" });

  expect(events.map((event) => event.seq)).toEqual(events.map((_, index) => index));
  const times = events.map((event) => event.t);
  expect(times).toEqual([...times].sort((a, b) => a - b));
});
});
