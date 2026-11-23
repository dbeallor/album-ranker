import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/library" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

import { ClientEvents } from "./client-events";

type Sent = { type: string; [key: string]: unknown };

let beacon: ReturnType<typeof vi.fn>;

function sentBodies(): Promise<Sent[][]> {
  return Promise.all(
    beacon.mock.calls.map(async ([, body]) => (JSON.parse(await (body as Blob).text()) as { events: Sent[] }).events),
  );
}

async function flushAndRead(): Promise<Sent[]> {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  return (await sentBodies()).flat();
}

function Page() {
  return (
    <>
      <ClientEvents />
      <button type="button" data-event="skip">
        Album One
      </button>
      <input aria-label="Year" />
    </>
  );
}

beforeEach(() => {
  navigation.pathname = "/library";
  beacon = vi.fn(() => true);
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("client events component", () => {
  it.each([
    { name: "the flag is not set", flag: undefined, pathname: "/library" },
    { name: "the flag is 0", flag: "0", pathname: "/library" },
    { name: "the page is /login", flag: "1", pathname: "/login" },
  ])("sends nothing when $name", async ({ flag, pathname }) => {
    if (flag !== undefined) vi.stubEnv("NEXT_PUBLIC_CLIENT_EVENTS", flag);
    navigation.pathname = pathname;
    render(<Page />);
    fireEvent.click(screen.getByRole("button"));

    expect(await flushAndRead()).toEqual([]);
    expect(beacon).not.toHaveBeenCalled();
  });

  it("reports the page, one click, and nothing that was typed", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLIENT_EVENTS", "1");
    render(<Page />);

    fireEvent.input(screen.getByLabelText("Year"), { target: { value: "secret typed text" } });
    fireEvent.click(screen.getByRole("button"));
    const events = await flushAndRead();

    expect(events.map((event) => event.type)).toEqual(["page", "click"]);
    expect(events[0]).toMatchObject({ path: "/library" });
    expect(events[1]).toMatchObject({ tag: "button", name: "skip" });
    const text = JSON.stringify(events);
    expect(text).not.toContain("secret typed text");
    expect(text).not.toContain("Album One");
    expect(beacon).toHaveBeenCalledWith("/events", expect.any(Blob));
  });

  it("keeps the events when sendBeacon refuses them, and sends them on the next try", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLIENT_EVENTS", "1");
    render(<Page />);
    beacon.mockReturnValueOnce(false);

    fireEvent.click(screen.getByRole("button"));
    await flushAndRead();
    await flushAndRead();

    const [refused, retried] = await sentBodies();
    expect(beacon).toHaveBeenCalledTimes(2);
    expect(retried).toEqual(refused);
    expect(retried.map((event) => event.type)).toEqual(["page", "click"]);
  });

  it("sends at most 30000 bytes per flush and the rest on the next one", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLIENT_EVENTS", "1");
    render(<Page />);

    for (let i = 0; i < 20; i++) {
      const failure = new Error(`boom ${i}`);
      failure.stack = `Error: boom ${i}\n${"    at f (/_next/static/chunk.js:1:2)\n".repeat(60)}`;
      window.dispatchEvent(new ErrorEvent("error", { message: failure.message, error: failure }));
    }
    await flushAndRead();
    await flushAndRead();
    await flushAndRead();

    const sizes = beacon.mock.calls.map(([, body]) => (body as Blob).size);
    const sent = (await sentBodies()).flat();
    expect(sizes.length).toBeGreaterThan(1);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(30_000);
    expect(sent.filter((event) => event.type === "error")).toHaveLength(20);
    expect(sent[0]).toMatchObject({ type: "page" });
  });

  it("reports a failed same-origin request but not one to /events or another host", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLIENT_EVENTS", "1");
    const responses: Record<string, Response> = {
      "/search?q=getz": new Response("", { status: 503 }),
      "/events": new Response("", { status: 500 }),
      "https://other.example/x": new Response("", { status: 500 }),
      "/ok": new Response("", { status: 200 }),
    };
    vi.stubGlobal("fetch", vi.fn(async (input: string) => responses[input]));
    render(<Page />);

    for (const url of Object.keys(responses)) await window.fetch(url);
    const failed = (await flushAndRead()).filter((event) => event.type === "request-failed");

    expect(failed).toEqual([expect.objectContaining({ method: "GET", path: "/search", status: 503 })]);
    vi.unstubAllGlobals();
  });
});
