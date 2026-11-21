export type CatalogAlbum = {
  catalogId: string;
  title: string;
  artist: string;
  year: number | null;
  coverUrl: string;
};

export type SearchResult =
  | { ok: true; albums: CatalogAlbum[] }
  | { ok: false; message: string };
