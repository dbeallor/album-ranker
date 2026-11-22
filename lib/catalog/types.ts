export type CatalogAlbum = {
  catalogId: string;
  title: string;
  artist: string;
  /** The credit's MusicBrainz artist ids joined with "+", or null when the credit has none. */
  artistId: string | null;
  year: number | null;
  coverUrl: string;
};

export type SearchResult =
  | { ok: true; albums: CatalogAlbum[] }
  | { ok: false; message: string };

/** What to ask the catalog for. */
export type CatalogQuery =
  /** Every word in the album title or the artist name. */
  | { kind: "text"; text: string }
  /** Every title word in the title and at least one artist word in the artist name; words of 5 or more letters tolerate a typo. */
  | { kind: "fields"; title?: string; artist?: string };
