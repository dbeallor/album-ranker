import { describe, expect, it } from "vitest";
import { loadArtistPage } from "./artists";
import { createAlbum } from "./db/albums";
import { memoryDb } from "./db/test-db";
import { addToLibrary } from "./db/library";

describe("artist page loader", () => {
  function seed() {
    const db = memoryDb();
    const a1 = createAlbum(db, { title: "A One", artist: { name: "Aardvark" }, coverUrl: "https://example.test/a.jpg" }).id;
    const b1 = createAlbum(db, { title: "B One", artist: { name: "Bear" } }).id;
    const a2 = createAlbum(db, { title: "A Two", artist: { name: "Aardvark" } }).id;
    const a3 = createAlbum(db, { title: "A Unplaced", artist: { name: "Aardvark" } }).id;
    const c1 = createAlbum(db, { title: "C Listed", artist: { name: "Cat" } }).id;
    addToLibrary(db, { albumId: a1, year: 1971 });
    addToLibrary(db, { albumId: b1, year: 1972 });
    addToLibrary(db, { albumId: a2, year: 1969 });
    addToLibrary(db, { albumId: c1, year: 1971 });
    return { db, a1, b1, a2, a3, c1 };
  }

  it("loads an artist page with library albums by year and their ratings", () => {
    const { db, a1, a2, c1 } = seed();
    const aardvarkId = db.prepare("SELECT id FROM artists WHERE name = 'Aardvark'").get()!.id as number;
    const page = loadArtistPage(db, aardvarkId)!;

    expect(page.name).toBe("Aardvark");
    expect(page.ratedAlbumCount).toBe(2);
    expect(page.albums.map((x) => [x.albumId, x.year, x.rating, x.coverUrl === null, x.wins, x.losses, x.ties])).toEqual([
      [a2, 1969, 1500, true, 0, 0, 0],
      [a1, 1971, 1500, false, 0, 0, 0],
    ]);

    const cat = loadArtistPage(db, db.prepare("SELECT id FROM artists WHERE name = 'Cat'").get()!.id as number)!;
    expect(cat.albums).toMatchObject([{ albumId: c1, rating: 1500 }]);
    expect(cat.score).toBe(1500);
    expect(cat.ratedAlbumCount).toBe(1);
  });

  it("an unknown artist is undefined", () => {
    expect(loadArtistPage(seed().db, 9999)).toBeUndefined();
  });
});
