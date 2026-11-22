import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/matchups/42" }));

import { SiteHeader } from "./site-header";

// jsdom has no showModal or close on a dialog; these stand in for the open attribute they toggle.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(cleanup);

describe("site header menu", () => {
  it("marks only the link for the section you are in as the current page", () => {
    render(<SiteHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    const links = within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link");
    expect(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.getAttribute("href"))).toEqual(["/matchups"]);
  });
});
