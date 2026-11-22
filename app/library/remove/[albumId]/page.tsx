import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Button, ButtonLink } from "@/components/ui/button";
import { Cluster } from "@/components/ui/cluster";
import { Message } from "@/components/ui/message";
import { PageHeader } from "@/components/ui/page-header";
import { Stack } from "@/components/ui/stack";
import { getAlbum } from "@/lib/db/albums";
import { getLibraryEntry } from "@/lib/db/library";
import { countMatchupsForAlbum } from "@/lib/db/matchups";
import { getDb } from "@/lib/db/server";
import { removeAlbumAction } from "./actions";

type Param = string | string[] | undefined;

function consequence(matchups: number): string {
  if (matchups === 0) return "This deletes the album. It has no matchups. This can't be undone.";
  const count = matchups === 1 ? "its 1 matchup" : `its ${matchups} matchups`;
  return `This deletes the album and ${count}. The ratings of the albums it played will change. This can't be undone.`;
}

export default async function RemoveAlbumPage({
  params,
  searchParams,
}: {
  params: Promise<{ albumId: string }>;
  searchParams: Promise<{ error?: Param }>;
}) {
  await connection(); // the matchup count is read per request, not at build time
  const { albumId } = await params;
  if (!/^[1-9]\d*$/.test(albumId) || !Number.isSafeInteger(Number(albumId))) notFound();

  const db = getDb();
  const id = Number(albumId);
  const album = getAlbum(db, id);
  const entry = album && getLibraryEntry(db, id);
  if (!album || !entry) notFound();

  const matchups = countMatchupsForAlbum(db, id);
  const { error } = await searchParams;
  const errorMessage = (Array.isArray(error) ? error[0] : error) ?? "";

  return (
    <>
      <PageHeader
        title={`Remove ${album.title} from your library?`}
        description={`${album.artist.name} · ${entry.year} · ${matchups} ${matchups === 1 ? "matchup" : "matchups"}`}
      />
      <Stack gap={4}>
        {errorMessage !== "" && (
          <Message tone="error" role="alert">
            {errorMessage}
          </Message>
        )}
        <p>{consequence(matchups)}</p>
        <form action={removeAlbumAction}>
          <input type="hidden" name="albumId" value={id} />
          <input type="hidden" name="matchups" value={matchups} />
          <Cluster>
            <Button type="submit" variant="danger">
              Remove album
            </Button>
            <ButtonLink href="/library">Keep it</ButtonLink>
          </Cluster>
        </form>
      </Stack>
    </>
  );
}
