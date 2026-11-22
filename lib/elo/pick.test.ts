import { describe, expect, it } from "vitest";
import type { EloResult } from "./elo";
import { MIN_ESTABLISHED_FOR_PLACEMENT, PLACEMENT_MATCHUPS, pairKey, pickMatchup, placementSlot, type PickAlbum, type PickMatchup } from "./pick";

const album = (id: number, rating = 1500): PickAlbum => ({ id, rating });
const played = (a: number, b: number, result: EloResult = "tie"): PickMatchup => ({ albumAId: a, albumBId: b, result });
const fixed = (value: number) => () => value;

/** Matchups that give each of these albums exactly PLACEMENT_MATCHUPS, so they all count as established. */
function establishedMatchups(ids: number[]): PickMatchup[] {
  const rounds = PLACEMENT_MATCHUPS / 2;
  return ids.flatMap((id, i) => Array.from({ length: rounds }, () => played(id, ids[(i + 1) % ids.length])));
}

/** Albums 1..n whose ratings rise with id, all above the 1500 a new album starts at. */
const ascending = (n: number) => Array.from({ length: n }, (_, i) => album(i + 1, 1600 + (i + 1) * 20));
const idsOf = (albums: PickAlbum[]) => albums.map((a) => a.id);

/** Small seeded generator (mulberry32), so no test touches Math.random. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NEW = 100;

describe("pairKey", () => {
  it("is the same either way round", () => {
    expect(pairKey(3, 7)).toBe(pairKey(7, 3));
    expect(pairKey(3, 7)).not.toBe(pairKey(3, 8));
  });
});

describe("pickMatchup", () => {
  it.each([
    { name: "no albums", albums: [] },
    { name: "one album", albums: [album(1)] },
  ])("returns nothing when no pair is possible: $name", ({ albums }) => {
    expect(pickMatchup({ albums, matchups: [], avoid: new Set(), random: fixed(0) })).toBeUndefined();
  });

  it("pairs any two albums, never an album with itself", () => {
    const albums = [album(1), album(2), album(3), album(4)];
    for (const random of [0, 0.3, 0.6, 0.99]) {
      const pair = pickMatchup({ albums, matchups: [], avoid: new Set(), random: fixed(random) })!;
      expect(pair.a).not.toBe(pair.b);
    }
  });

  it("pairs the only two albums", () => {
    expect(pickMatchup({ albums: [album(1), album(2)], matchups: [], avoid: new Set(), random: fixed(0) })).toEqual({ a: 1, b: 2 });
  });

  it("never serves a played pair while an unplayed one exists", () => {
    const albums = [album(1), album(2), album(3)];
    for (const random of [0, 0.5, 0.99]) {
      const pair = pickMatchup({ albums, matchups: [played(1, 2)], avoid: new Set(), random: fixed(random) })!;
      expect(pairKey(pair.a, pair.b)).not.toBe(pairKey(1, 2));
    }
  });

  it("never serves an avoided pair while another exists", () => {
    const albums = [album(1), album(2), album(3)];
    const avoid = new Set([pairKey(1, 2), pairKey(1, 3)]);
    for (const random of [0, 0.5, 0.99]) {
      const pair = pickMatchup({ albums, matchups: [], avoid, random: fixed(random) })!;
      expect(pairKey(pair.a, pair.b)).toBe(pairKey(2, 3));
    }
  });

  it("starts with the album that has the fewest matchups", () => {
    const albums = [album(1), album(2), album(3)];
    const pair = pickMatchup({ albums, matchups: [played(1, 2)], avoid: new Set(), random: fixed(0) })!;
    expect(pair.a).toBe(3);
  });

  it.each([
    { random: 0, first: 1 },
    { random: 0.5, first: 2 },
    { random: 0.99, first: 3 },
  ])("chooses randomly among ties: random $random picks album $first", ({ random, first }) => {
    const albums = [album(3), album(1), album(2)];
    expect(pickMatchup({ albums, matchups: [], avoid: new Set(), random: fixed(random) })!.a).toBe(first);
  });

  it("passes over an album with no unplayed opponent for the next fewest", () => {
    // Album 1 has no matchups but every opponent is avoided; album 3 is next, and 2 is its closest unplayed opponent.
    const albums = [album(1), album(2), album(3), album(4)];
    const avoid = new Set([pairKey(1, 2), pairKey(1, 3), pairKey(1, 4)]);
    const pair = pickMatchup({ albums, matchups: [played(2, 4)], avoid, random: fixed(0) });
    expect(pair).toEqual({ a: 3, b: 2 });
  });

  it.each([
    { name: "the closest rating", ratings: [1500, 1520, 1480, 1600], expected: 2 },
    { name: "the lower id on a rating tie", ratings: [1500, 1550, 1450, 1600], expected: 2 },
  ])("picks the opponent with $name", ({ ratings, expected }) => {
    const albums = ratings.map((rating, i) => album(i + 1, rating));
    // Make album 1 the first album: the others each have one matchup against each other.
    const matchups = [played(2, 3), played(3, 4), played(2, 4)];
    expect(pickMatchup({ albums, matchups, avoid: new Set(), random: fixed(0) })).toEqual({ a: 1, b: expected });
  });

  it("falls back to the closest-rated opponent, played or not, when every pair is played", () => {
    const albums = [album(1, 1500), album(2, 1510), album(3, 1505)];
    const matchups = [played(1, 2), played(1, 3), played(2, 3)];
    expect(pickMatchup({ albums, matchups, avoid: new Set(), random: fixed(0) })).toEqual({ a: 1, b: 3 });
  });

  it("falls back the same way when every unplayed pair is avoided", () => {
    const albums = [album(1, 1500), album(2, 1510)];
    expect(pickMatchup({ albums, matchups: [], avoid: new Set([pairKey(1, 2)]), random: fixed(0) })).toEqual({ a: 1, b: 2 });
  });
});

describe("pickMatchup placement of a new album", () => {
  it.each([
    { name: "an odd number of established albums", count: 9, expected: 5 },
    { name: "an even number of established albums", count: 10, expected: 6 },
  ])("opens with the middle of the rating order, not the lowest id: $name", ({ count, expected }) => {
    // Ratings fall as id rises, so the middle by rating is the middle id, and the closest to 1500 is the highest id.
    const established = Array.from({ length: count }, (_, i) => album(i + 1, 1600 + (count - i) * 20));
    const albums = [...established, album(NEW)];
    const matchups = establishedMatchups(idsOf(established));
    for (const random of [0, 0.5, 0.99]) {
      expect(pickMatchup({ albums, matchups, avoid: new Set(), random: fixed(random) })).toEqual({ a: NEW, b: expected });
    }
  });

  it.each([
    { name: "a win goes higher", result: "a" as const, ok: (id: number) => id > 5 },
    { name: "a loss goes lower", result: "b" as const, ok: (id: number) => id < 5 },
    { name: "a tie goes to a neighbour of the first opponent", result: "tie" as const, ok: (id: number) => id === 4 || id === 6 },
  ])("searches by the answer: $name", ({ result, ok }) => {
    const established = ascending(9);
    const albums = [...established, album(NEW)];
    const base = establishedMatchups(idsOf(established));
    const first = pickMatchup({ albums, matchups: base, avoid: new Set(), random: fixed(0) })!;
    expect(first).toEqual({ a: NEW, b: 5 });
    const next = pickMatchup({ albums, matchups: [...base, played(NEW, first.b, result)], avoid: new Set(), random: fixed(0) })!;
    expect(next.a).toBe(NEW);
    expect(ok(next.b)).toBe(true);
  });

  it.each([0, 0.3, 0.6, 0.99])("never pairs a new album with a new one while it is placing: random %s", (random) => {
    const established = ascending(10);
    const newIds = [101, 102, 103];
    const albums = [...established, ...newIds.map((id) => album(id))];
    const answer = seeded(7);
    const results: EloResult[] = ["a", "b", "tie"];
    const matchups = establishedMatchups(idsOf(established));
    const count = (id: number) => matchups.filter((m) => m.albumAId === id || m.albumBId === id).length;

    while (newIds.some((id) => count(id) < PLACEMENT_MATCHUPS)) {
      const pair = pickMatchup({ albums, matchups, avoid: new Set(), random: fixed(random) })!;
      const newInPair = [pair.a, pair.b].filter((id) => newIds.includes(id));
      expect(newInPair).toHaveLength(1);
      matchups.push(played(pair.a, pair.b, results[Math.floor(answer() * 3)]));
    }
  });

  it.each([
    {
      name: "an established first album",
      albums: [album(1, 1500), album(2, 1700), album(3, 1510), ...Array.from({ length: 7 }, (_, i) => album(i + 4, 1800 + i))],
      establishedIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      extra: [],
      expected: { a: 1, b: 3 },
    },
    {
      name: "an all-new library",
      albums: [album(1, 1500), album(2, 1540), album(3, 1490), album(4, 1600)],
      establishedIds: [],
      extra: [],
      expected: { a: 1, b: 3 },
    },
    {
      // Albums 1 and 2 are established; new albums 3 and 4 have each met both, and not each other.
      name: "a new album that has met every established album",
      albums: [album(1, 1600), album(2, 1700), album(3, 1500), album(4, 1650)],
      establishedIds: [1, 2],
      extra: [played(3, 1), played(3, 2), played(4, 1), played(4, 2)],
      expected: { a: 3, b: 4 },
    },
  ])("uses the closest-rated opponent for $name", ({ albums, establishedIds, extra, expected }) => {
    const matchups = [...establishedMatchups(establishedIds), ...extra];
    expect(pickMatchup({ albums, matchups, avoid: new Set(), random: fixed(0) })).toEqual(expected);
  });

  it.each([
    { name: "an avoided midpoint goes to the nearer lower neighbour", matchups: [], avoid: [5], expected: 4 },
    { name: "a played midpoint goes to the nearer lower neighbour", matchups: [played(NEW, 5)], avoid: [], expected: 4 },
    { name: "an avoided midpoint and neighbour go to the next nearest", matchups: [], avoid: [5, 4], expected: 6 },
    { name: "the whole window avoided goes outside it", matchups: [played(NEW, 5, "a")], avoid: [6, 7, 8, 9], expected: 4 },
    { name: "an avoided middle of the window goes to the nearer one in it", matchups: [played(NEW, 5, "a")], avoid: [7], expected: 6 },
  ])("skips to the nearest valid album: $name", ({ matchups, avoid, expected }) => {
    const established = ascending(9);
    const albums = [...established, album(NEW)];
    const pair = pickMatchup({
      albums,
      matchups: [...establishedMatchups(idsOf(established)), ...matchups],
      avoid: new Set(avoid.map((id) => pairKey(NEW, id))),
      random: fixed(0),
    });
    expect(pair).toEqual({ a: NEW, b: expected });
  });

  it.each([
    { established: MIN_ESTABLISHED_FOR_PLACEMENT - 1, expected: 1, name: "the closest-rated album below the minimum" },
    { established: MIN_ESTABLISHED_FOR_PLACEMENT, expected: 4, name: "the placement midpoint at the minimum" },
  ])("opens with $name: $established established albums", ({ established: count, expected }) => {
    const established = ascending(count);
    const pair = pickMatchup({
      albums: [...established, album(NEW)],
      matchups: establishedMatchups(idsOf(established)),
      avoid: new Set(),
      random: fixed(0),
    });
    expect(pair).toEqual({ a: NEW, b: expected });
  });

  it("spreads matchups over the library when only one album is established", () => {
    const albums = [album(1, 1500), ...Array.from({ length: 30 }, (_, i) => album(i + 2, 1350 + i * 10))];
    // Album 1 is established through matchups against albums outside the library.
    const matchups = Array.from({ length: PLACEMENT_MATCHUPS }, (_, i) => played(1, 900 + i));
    const answer = seeded(11);
    const random = seeded(5);
    const results: EloResult[] = ["a", "b", "tie"];
    const uses = new Map<number, number>();
    for (let step = 0; step < 20; step++) {
      const pair = pickMatchup({ albums, matchups, avoid: new Set(), random })!;
      const unplayed = albums.filter((o) => o.id !== pair.a && !matchups.some((m) => pairKey(m.albumAId, m.albumBId) === pairKey(pair.a, o.id)));
      const rating = (id: number) => albums.find((o) => o.id === id)!.rating;
      const gap = (o: PickAlbum) => Math.abs(o.rating - rating(pair.a));
      const expected = unplayed.reduce((best, o) => (gap(o) < gap(best) || (gap(o) === gap(best) && o.id < best.id) ? o : best));
      expect(pair.b).toBe(expected.id);
      for (const id of [pair.a, pair.b]) uses.set(id, (uses.get(id) ?? 0) + 1);
      matchups.push(played(pair.a, pair.b, results[Math.floor(answer() * 3)]));
    }
    expect(Math.max(...uses.values())).toBeLessThanOrEqual(5);
  });

  it("passes over recent opponents: 10 new albums against 20 established ones", () => {
    const established = ascending(20);
    const newIds = Array.from({ length: 10 }, (_, i) => NEW + i);
    const albums = [...established, ...newIds.map((id) => album(id))];
    const matchups = establishedMatchups(idsOf(established));
    const base = matchups.length;
    const random = seeded(3);
    const firstOpponent = new Map<number, number>();
    for (let step = 0; step < 10; step++) {
      const pair = pickMatchup({ albums, matchups, avoid: new Set(), random })!;
      if (!firstOpponent.has(pair.a)) firstOpponent.set(pair.a, pair.b);
      matchups.push(played(pair.a, pair.b, "a"));
    }
    const placed = matchups.slice(base);
    for (let i = 1; i < placed.length; i++) {
      expect(placed[i].albumBId).not.toBe(placed[i - 1].albumBId);
    }
    // The middle of 20 albums is place 9 (0-based), id 10; "within 2 places" is ids 8 to 12.
    expect(firstOpponent.size).toBe(10);
    for (const opponent of firstOpponent.values()) expect(Math.abs(opponent - 10)).toBeLessThanOrEqual(2);
  });

  it.each([
    {
      name: "a window of only recent albums still beats albums outside it",
      extra: [played(101, 2), played(101, 3), played(NEW, 5, "a"), played(NEW, 7, "b"), played(101, 6)],
      expected: 6,
    },
    {
      name: "a non-recent album in the window beats recent ones in it",
      extra: [played(101, 2), played(101, 3), played(NEW, 5, "a"), played(101, 7), played(101, 6), played(101, 8)],
      expected: 9,
    },
  ])("prefers the window, then recency: $name", ({ extra, expected }) => {
    const established = ascending(9);
    const matchups = [...establishedMatchups(idsOf(established)), ...extra];
    const albums = [...established, album(NEW), album(101)];
    expect(pickMatchup({ albums, matchups, avoid: new Set(), random: fixed(0) })).toEqual({ a: NEW, b: expected });
  });

  it("places a new album within 2 slots of its true slot in at most 8 matchups", () => {
    // Established album i has true strength i; a new album at true slot s beats exactly those below it.
    const established = Array.from({ length: 20 }, (_, i) => album(i + 1, 1400 + i * 25));
    const strength = (id: number) => id - 1;
    for (const slot of [0, 1, 4, 7, 10, 13, 16, 19, 20]) {
      const albums = [...established, album(NEW)];
      const matchups = establishedMatchups(idsOf(established));
      const random = seeded(slot + 1);
      for (let step = 0; step < PLACEMENT_MATCHUPS; step++) {
        const pair = pickMatchup({ albums, matchups, avoid: new Set(), random })!;
        expect(pair.a).toBe(NEW);
        const result: EloResult = slot - 0.5 > strength(pair.b) ? "a" : "b";
        matchups.push(played(pair.a, pair.b, result));
      }
      const { lo, hi } = placementSlot({ albumId: NEW, albums, matchups });
      expect(slot - lo).toBeLessThanOrEqual(2);
      expect(hi - slot).toBeLessThanOrEqual(2);
    }
  });
});

describe("placementSlot", () => {
  const established = ascending(9);
  const albums = [...established, album(NEW)];
  const slot = (matchups: PickMatchup[]) =>
    placementSlot({ albumId: NEW, albums, matchups: [...establishedMatchups(idsOf(established)), ...matchups] });

  it.each([
    { name: "no matchups", matchups: [], expected: { lo: 0, hi: 9 } },
    { name: "a win over the middle", matchups: [played(NEW, 5, "a")], expected: { lo: 5, hi: 9 } },
    { name: "a win with the new album on side B", matchups: [played(5, NEW, "b")], expected: { lo: 5, hi: 9 } },
    { name: "a loss to the middle", matchups: [played(NEW, 5, "b")], expected: { lo: 0, hi: 4 } },
    { name: "a tie with the middle", matchups: [played(NEW, 5)], expected: { lo: 4, hi: 5 } },
    { name: "a win then a loss", matchups: [played(NEW, 3, "a"), played(NEW, 7, "b")], expected: { lo: 3, hi: 6 } },
    { name: "a match against another new album", matchups: [played(NEW, 101, "a")], expected: { lo: 0, hi: 9 } },
  ])("narrows the slots: $name", ({ matchups, expected }) => {
    expect(slot(matchups)).toEqual(expected);
  });

  it.each([
    { name: "a win then a loss against the same album", matchups: [played(NEW, 5, "a"), played(NEW, 5, "b")], expected: { lo: 0, hi: 4 } },
    { name: "a loss then a win against the same album", matchups: [played(NEW, 5, "b"), played(NEW, 5, "a")], expected: { lo: 5, hi: 9 } },
    { name: "a win then a tie with a lower album", matchups: [played(NEW, 5, "a"), played(NEW, 2)], expected: { lo: 1, hi: 2 } },
  ])("lets the newest answer win a contradiction: $name", ({ matchups, expected }) => {
    expect(slot(matchups)).toEqual(expected);
  });
});

