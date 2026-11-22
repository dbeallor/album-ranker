import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/matchups" }));

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { NAV_ITEMS, SiteHeader } from "./site-header";

// jsdom has no showModal or close on a dialog; this stands in for the open attribute they toggle.
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
  it("keeps the nav in flow order", () => {
    expect(NAV_ITEMS.map((item) => [item.label, item.href])).toEqual([
      ["Add albums", "/search"],
      ["Library", "/library"],
      ["Play", "/matchups"],
      ["Rankings", "/analytics"],
    ]);
  });

  it("starts closed, with a Menu button", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("button", { name: "Menu" })).toBeDefined();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("opens from the Menu button and lists the four links with the current one marked", () => {
    render(<SiteHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));

    const links = within(screen.getByRole("navigation", { name: "Main" })).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["01Add albums", "/search"],
      ["02Library", "/library"],
      ["03Play", "/matchups"],
      ["04Rankings", "/analytics"],
    ]);
    expect(links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.getAttribute("href"))).toEqual(["/matchups"]);
  });

  it("closes on Close", () => {
    render(<SiteHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });

  it("closes when a link is chosen", () => {
    render(<SiteHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    // Next's Link has handled the click by now; stop jsdom from trying to load the page.
    document.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(screen.getByRole("link", { name: "Library" }));

    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});
