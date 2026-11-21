import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Cover } from "@/components/cover";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { Stack } from "@/components/ui/stack";
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
    <>
      <PageHeader
        title={artist.name}
        description={
          artist.score === null
            ? "No rated albums"
            : `Score ${Math.round(artist.score)} from ${artist.ratedAlbumCount} rated ${artist.ratedAlbumCount === 1 ? "album" : "albums"}`
        }
        actions={<ButtonLink href="/artists">All artists</ButtonLink>}
      />

      {artist.albums.length === 0 ? (
        <EmptyState>No placed albums.</EmptyState>
      ) : (
        <Stack as="ul" gap={3}>
          {artist.albums.map((album) => (
            <Card as="li" key={album.albumId}>
              <ListRow
                cover={<Cover src={album.coverUrl} alt={`Cover of ${album.title}`} />}
                title={album.title}
                subtitle={album.year}
                meta={
                  <>
                    <span>{placementText(album)}</span> · <span>{album.rating === null ? "No rating" : `Rating ${Math.round(album.rating)}`}</span>
                  </>
                }
              />
            </Card>
          ))}
        </Stack>
      )}
    </>
  );
}
