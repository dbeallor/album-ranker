import { describe, expect, it } from "vitest";
import { artistScore, decadeArtistScore } from "./artist-score";

describe("artistScore", () => {
  it.each([
    { name: "1600 and 1700", ratings: [1600, 1700], expected: 1600 },
    { name: "one album", ratings: [1700], expected: 1600 },
    { name: "no rated albums", ratings: [], expected: undefined },
  ])("$name", ({ ratings, expected }) => {
    expect(artistScore(ratings)).toBe(expected);
  });
});

describe("decadeArtistScore", () => {
  const albums = [
    { year: 1969, rating: 1600 },
    { year: 1960, rating: 1700 },
    { year: 1970, rating: 1900 },
  ];

  it.each([
    { name: "leaves out other decades", decade: 1960, expected: 1600 },
    { name: "a decade with no albums", decade: 1980, expected: undefined },
  ])("$name", ({ decade, expected }) => {
    expect(decadeArtistScore(albums, decade)).toBe(expected);
  });
});
