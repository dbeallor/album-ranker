import { describe, expect, it } from "vitest";
import {
  createImportReviewItem,
  findImportReviewItem,
  listImportReviewItems,
  resolveImportReviewItem,
  skipImportReviewItem,
} from "./import-review";
import { errorCode, memoryDb, seedAlbums } from "./test-db";

const source = { title: "Kid A", artist: "Radiohead", year: 2000 };
const candidate = {
  catalogId: "mb-1",
  title: "Kid A",
  artist: "Radiohead",
  releaseYear: 2000,
  coverUrl: null,
};
const input = { source, sourcePlacement: "ranked" as const, sourceRank: 1, candidates: [candidate] };

describe("import review items", () => {
  it("rejects a duplicate source row key", () => {
    const db = memoryDb();
    const item = createImportReviewItem(db, input);
    expect(item).toMatchObject({ status: "open", candidates: [candidate], resolvedAlbumId: null });
    expect(findImportReviewItem(db, source)).toEqual(item);
    expect(errorCode(() => createImportReviewItem(db, input))).toBe("invalid_input");
  });

  const outcomes = [
    { name: "resolve", status: "resolved", act: (db: Parameters<typeof resolveImportReviewItem>[0], id: number, album: number) => resolveImportReviewItem(db, id, album) },
    { name: "skip", status: "skipped", act: (db: Parameters<typeof resolveImportReviewItem>[0], id: number) => skipImportReviewItem(db, id) },
  ] as const;
  it.each(outcomes)("$name keeps the row", ({ status, act }) => {
    const db = memoryDb();
    const [album] = seedAlbums(db, 1);
    const item = createImportReviewItem(db, input);

    const done = act(db, item.id, album);

    expect(done.status).toBe(status);
    expect(done.resolvedAlbumId).toBe(status === "resolved" ? album : null);
    expect(listImportReviewItems(db, "open")).toEqual([]);
    expect(listImportReviewItems(db, status)).toHaveLength(1);
    expect(findImportReviewItem(db, source)).toBeDefined();
  });

  const reasons = [
    { name: "defaults to no match", extra: {}, reason: "no_match", detail: null },
    { name: "stores ambiguous", extra: { reason: "ambiguous" as const }, reason: "ambiguous", detail: null },
    { name: "stores a duplicate album with its year", extra: { reason: "duplicate_album" as const, reasonDetail: "1999" }, reason: "duplicate_album", detail: "1999" },
    { name: "stores a taken rank with the album", extra: { reason: "rank_taken" as const, reasonDetail: "Kid A - Radiohead" }, reason: "rank_taken", detail: "Kid A - Radiohead" },
  ];
  it.each(reasons)("$name", ({ extra, reason, detail }) => {
    const db = memoryDb();
    const item = createImportReviewItem(db, { ...input, ...extra });
    expect(item).toMatchObject({ reason, reasonDetail: detail });
    expect(findImportReviewItem(db, source)).toEqual(item);
  });

  it("rejects a reason the schema does not know", () => {
    const db = memoryDb();
    expect(() =>
      createImportReviewItem(db, { ...input, reason: "bogus" as unknown as "no_match" }),
    ).toThrow(/CHECK/);
  });
});
