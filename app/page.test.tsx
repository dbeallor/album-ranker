import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import Home from "./page";

afterEach(cleanup);

test("home page shows the Album ranker heading", () => {
  render(<Home />);
  expect(
    screen.getByRole("heading", { level: 1, name: "Album ranker" }),
  ).toBeDefined();
});

test("home page links to the artist views", () => {
  render(<Home />);
  expect(screen.getByRole("link", { name: "Artists" }).getAttribute("href")).toBe("/artists");
});
