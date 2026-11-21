import { Cover } from "@/components/cover";
import { searchAlbums } from "@/lib/catalog/search";

type SearchParams = Promise<{ q?: string | string[] }>;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q) ?? "";
  const result = query.trim() === "" ? null : await searchAlbums(query);

  return (
    <main>
      <h1>Search albums</h1>
      <form method="get" action="/search">
        <input type="search" name="q" defaultValue={query} aria-label="Album or artist" />
        <button type="submit">Search</button>
      </form>

      {result && !result.ok && <p role="alert">{result.message}</p>}
      {result?.ok && result.albums.length === 0 && <p>No albums found for &quot;{query.trim()}&quot;.</p>}
      {result?.ok && result.albums.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {result.albums.map((album) => (
            <li key={album.catalogId} style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <Cover src={album.coverUrl} alt={`Cover of ${album.title}`} />
              <div>
                <strong>{album.title}</strong>
                <div>{album.artist}</div>
                <div>{album.year ?? "Unknown year"}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
