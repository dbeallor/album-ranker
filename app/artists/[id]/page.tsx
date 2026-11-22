import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Cover } from "@/components/cover";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardGrid } from "@/components/ui/card-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { PageHeader } from "@/components/ui/page-header";
import { loadArtistPage } from "@/lib/artists";
import { getDb } from "@/lib/db/server";

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
            ? "No albums in the library"
            : `Score ${Math.round(artist.score)} from ${artist.ratedAlbumCount} ${artist.ratedAlbumCount === 1 ? "album" : "albums"}`
        }
        actions={<ButtonLink href="/analytics?view=artists">All artists</ButtonLink>}
      />

      {artist.albums.length === 0 ? (
        <EmptyState>No albums in the library.</EmptyState>
      ) : (
        <CardGrid>
          {artist.albums.map((album) => (
            <Card as="li" key={album.albumId}>
              <ListRow
                cover={<Cover src={album.coverUrl} alt={`Cover of ${album.title}`} size={80} />}
                title={album.title}
                subtitle={album.year}
                meta={`Rating ${Math.round(album.rating)}`}
              />
            </Card>
          ))}
        </CardGrid>
      )}
    </>
  );
}
