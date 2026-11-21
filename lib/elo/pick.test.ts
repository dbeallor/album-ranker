import { describe, expect, it } from "vitest";
import { pairKey, pickMatchup, type PickAlbum } from "./pick";

const album = (id: number, year: number, rating = 1500): PickAlbum => ({ id, year, rating });
const played = (a: number, b: number) => ({ albumAId: a, albumBId: b });
const fixed = (value: number) => () => value;

describe("pairKey", () => {
  it("is the same either way round", () => {
    expect(pairKey(3, 7)).toBe(pairKey(7, 3));
    expect(pairKey(3, 7)).not.toBe(pairKey(3, 8));
  });
});

describe("pickMatchup", () => {
  it.each([
    { name: "no albums", albums: [] },
    { name: "one album", albums: [album(1, 2000)] },
    { name: "two albums from the same year", albums: [album(1, 2000), album(2, 2000)] },
  ])("returns nothing when no pair is possible: $name", ({ albums }) => {
    expect(pickMatchup({ albums, matchups: [], avoid: new Set(), random: fixed(0) })).toBeUndefined();
  });

  it("never pairs two albums from the same year", () => {
    const albums = [album(1, 2000), album(2, 2000), album(3, 2001), album(4, 2001)];
    for (const random of [0, 0.3, 0.6, 0.99]) {
      const pair = pickMatchup({ albums, matchups: [], avoid: new Set(), random: fixed(random) })!;
      const years = [pair.a, pair.b].map((id) => albums.find((a) => a.id === id)!.year);
      expect(years[0]).not.toBe(years[1]);
    }
  });

  it("never serves a played pair while an unplayed one exists", () => {
    const albums = [album(1, 2000), album(2, 2001), album(3, 2002)];
    for (const random of [0, 0.5, 0.99]) {
      const pair = pickMatchup({ albums, matchups: [played(1, 2)], avoid: new Set(), random: fixed(random) })!;
      expect(pairKey(pair.a, pair.b)).not.toBe(pairKey(1, 2));
    }
  });

  it("never serves an avoided pair while another exists", () => {
    const albums = [album(1, 2000), album(2, 2001), album(3, 2002)];
    const avoid = new Set([pairKey(1, 2), pairKey(1, 3)]);
    for (const random of [0, 0.5, 0.99]) {
      const pair = pickMatchup({ albums, matchups: [], avoid, random: fixed(random) })!;
      expect(pairKey(pair.a, pair.b)).toBe(pairKey(2, 3));
    }
  });

  it("starts with the album that has the fewest matchups", () => {
    const albums = [album(1, 2000), album(2, 2001), album(3, 2002)];
    const pair = pickMatchup({ albums, matchups: [played(1, 2)], avoid: new Set(), random: fixed(0) })!;
    expect(pair.a).toBe(3);
  });

  it.each([
    { random: 0, first: 1 },
    { random: 0.5, first: 2 },
    { random: 0.99, first: 3 },
  ])("chooses randomly among ties: random $random picks album $first", ({ random, first }) => {
    const albums = [album(3, 2002), album(1, 2000), album(2, 2001)];
    expect(pickMatchup({ albums, matchups: [], avoid: new Set(), random: fixed(random) })!.a).toBe(first);
  });

  it("passes over an album with no unplayed opponent for the next fewest", () => {
    // Album 1 has no matchups but every opponent is avoided; album 3 is next.
    const albums = [album(1, 2000), album(2, 2001), album(3, 2001), album(4, 2002)];
    const avoid = new Set([pairKey(1, 2), pairKey(1, 3), pairKey(1, 4)]);
    const pair = pickMatchup({ albums, matchups: [played(2, 4)], avoid, random: fixed(0) });
    expect(pair).toEqual({ a: 3, b: 4 });
  });

  it.each([
    { name: "the closest rating", ratings: [1500, 1520, 1480, 1600], expected: 2 },
    { name: "the lower id on a rating tie", ratings: [1500, 1550, 1450, 1600], expected: 2 },
  ])("picks the opponent with $name", ({ ratings, expected }) => {
    const albums = ratings.map((rating, i) => album(i + 1, 2000 + i, rating));
    // Make album 1 the first album: the others each have one matchup against each other.
    const matchups = [played(2, 3), played(3, 4), played(2, 4)];
    expect(pickMatchup({ albums, matchups, avoid: new Set(), random: fixed(0) })).toEqual({ a: 1, b: expected });
  });

  it("falls back to the closest-rated opponent, played or not, when every pair is played", () => {
    const albums = [album(1, 2000, 1500), album(2, 2001, 1510), album(3, 2002, 1505)];
    const matchups = [played(1, 2), played(1, 3), played(2, 3)];
    expect(pickMatchup({ albums, matchups, avoid: new Set(), random: fixed(0) })).toEqual({ a: 1, b: 3 });
  });

  it("falls back the same way when every unplayed pair is avoided", () => {
    const albums = [album(1, 2000, 1500), album(2, 2001, 1510)];
    expect(pickMatchup({ albums, matchups: [], avoid: new Set([pairKey(1, 2)]), random: fixed(0) })).toEqual({ a: 1, b: 2 });
  });
});
