import { describe, expect, it } from "vitest";
import { normalizeText } from "./normalize.ts";

describe("normalizeText", () => {
  const cases: [string, string, string][] = [
    ["lower case", "Fake ALBUM One", "fake album one"],
    ["accents", "Café Müller Ångström", "cafe muller angstrom"],
    ["ampersand", "Fake Artist N & Fake Artist O", "fake artist n and fake artist o"],
    ["plus", "Fake Artist N + Fake Artist O", "fake artist n and fake artist o"],
    ["and", "Fake Artist N and Fake Artist O", "fake artist n and fake artist o"],
    ["leading The", "The Fake Band", "fake band"],
    ["leading the in lower case", "the fake band", "fake band"],
    ["a title that only starts with 'the' letters", "Theory of Fake", "theory of fake"],
    ["trailing parentheses", "Fake Album (Remastered)", "fake album"],
    ["trailing brackets", "Fake Album [Deluxe Edition]", "fake album"],
    ["a bracketed qualifier in the middle", "Fake (Live) Album", "fake live album"],
    ["a title that is only a bracket", "(Untitled)", "untitled"],
    ["punctuation", "Fake: Album, It's Two!", "fake album its two"],
    ["slashes and hyphens", "Fake / Album - Two", "fake album two"],
    ["spaces", "  Fake    Album \t Two ", "fake album two"],
    ["compatibility characters", "Ｆａｋｅ ① ", "fake 1"],
  ];
  it.each(cases)("%s", (_name, input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it("makes equivalent spellings equal", () => {
    expect(normalizeText("The Fake Album (Remastered)")).toBe(normalizeText("fake album"));
    expect(normalizeText("Fake & Co.")).toBe(normalizeText("Fake and Co"));
  });
});
