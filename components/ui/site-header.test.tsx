import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/matchups/42" }));

import { NAV_ITEMS, SiteHeader } from "./site-header";

afterEach(cleanup);

describe("site header links", () => {
  it("shows the four page links in the bar and marks only the current section", () => {
    render(<SiteHeader />);

    const links = within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(NAV_ITEMS.map((item) => item.href));
    expect(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.getAttribute("href"))).toEqual(["/matchups"]);
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
  });
});
