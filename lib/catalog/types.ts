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
