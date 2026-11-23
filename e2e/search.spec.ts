import { expect, test } from "./fixtures";
import { goViaNav } from "./nav";

const QUERY = "getz gilberto";
const STUB_PORT = Number(process.env.CATALOG_STUB_PORT ?? 3101);

test.describe("search page", () => {
test("search for an album", async ({ page, recorded }) => {
  await page.goto("/");
  await goViaNav(page, "Add albums");
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

// A query no other test uses: the app caches search answers for 24 hours, so "getz gilberto" is already cached by
// flow.spec.ts and would not reach the stub at all.
test("results show while typing, without pressing Search, and typing makes one catalog request", async ({ page, request }) => {
  const count = async () => Number(await (await request.get(`http://127.0.0.1:${STUB_PORT}/__count`)).text());
  const before = await count();

  await page.goto("/search");
  await page.getByRole("searchbox", { name: "Album or artist" }).click();
  await page.keyboard.type("stan getz");

  await expect(page).toHaveURL(/\/search\?q=stan\+getz$/);
  await expect(page.locator("li strong").first()).toBeVisible();
  expect(await count()).toBe(before + 1);
});
});
