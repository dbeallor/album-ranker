import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Cover } from "@/components/cover";
import { loadArtistPage, type ArtistPageAlbum } from "@/lib/artists";
import { getDb } from "@/lib/db/server";

function placementText(album: ArtistPageAlbum): string {
  if (album.placement === "ranked") return `Ranked #${album.rank}`;
  return album.placement === "honorable_mention" ? "Honorable mention" : "Listed";
}

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  await connection(); // ratings are replayed per request, not at build time
  const { id } = await params;
  if (!/^(0|[1-9]\d*)$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();

  const artist = loadArtistPage(getDb(), Number(id));
  if (!artist) notFound();

  return (
    <main>
      <p>
        <Link href="/artists">All artists</Link>
      </p>
      <h1>{artist.name}</h1>
      <p>
        {artist.score === null
          ? "No rated albums"
          : `Score ${Math.round(artist.score)} from ${artist.ratedAlbumCount} rated ${artist.ratedAlbumCount === 1 ? "album" : "albums"}`}
      </p>

      {artist.albums.length === 0 ? (
        <p>No placed albums.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {artist.albums.map((album) => (
            <li key={album.albumId} style={{ display: "flex", gap: 16, marginBottom: 16 }}>
              <Cover src={album.coverUrl} alt={`Cover of ${album.title}`} />
              <div>
                <strong>{album.title}</strong>
                <div>{album.year}</div>
                <div>{placementText(album)}</div>
                <div>{album.rating === null ? "No rating" : `Rating ${Math.round(album.rating)}`}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
