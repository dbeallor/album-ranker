import Link from "next/link";
import { connection } from "next/server";
import { Cover } from "@/components/cover";
import { RankingProgress } from "@/components/ranking-progress";
import { Button, ButtonLink } from "@/components/ui/button";
import { Cluster } from "@/components/ui/cluster";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineForm } from "@/components/ui/inline-form";
import { Message } from "@/components/ui/message";
import { PageHeader } from "@/components/ui/page-header";
import { SectionLabel } from "@/components/ui/section-label";
import { Stack } from "@/components/ui/stack";
import { TextField } from "@/components/ui/text-field";
import { loadAnalytics } from "@/lib/analytics";
import { listImportReviewItems } from "@/lib/db/import-review";
import { getDb } from "@/lib/db/server";
import { countMatchups } from "@/lib/db/matchups";
import { LIFETIME } from "@/lib/scopes";
import styles from "./page.module.css";

const STRIP_COVERS = 8;
const TOP_ALBUMS = 5;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export default async function Home() {
  // The counts and rankings come from the database, so this page is rendered per request, not at build time.
  await connection();
  const db = getDb();
  const openItems = listImportReviewItems(db, "open").length;
  const matchups = countMatchups(db);
  const { data, libraryAlbums, progress } = loadAnalytics(db, "albums", LIFETIME);
  const ranking = data.view === "albums" ? data.rows : [];
  const albums = libraryAlbums.length;
  const facts =
    albums === 0
      ? "Your library is empty. Search for an album to start."
      : `${plural(albums, "album")} in your library · ${plural(matchups, "matchup")} played`;

  return (
    <Stack gap={7}>
      <PageHeader title="Rank the albums you love." description={facts} />

      {openItems > 0 && (
        <Message tone="info">
          <Link href="/import">Import review: {openItems} to check</Link>
        </Message>
      )}

      {ranking.length > 0 && (
        <ul className={styles.strip} aria-hidden="true">
          {ranking.slice(0, STRIP_COVERS).map(({ album }) => (
            <li key={album.albumId}>
              <Cover src={album.coverUrl} alt={`Cover of ${album.title}`} size={240} fill />
            </li>
          ))}
        </ul>
      )}

      <Stack as="section" gap={4} aria-labelledby="home-add">
        <SectionLabel as="h2" id="home-add">
          01 / Add albums
        </SectionLabel>
        <InlineForm method="get" action="/search">
          <TextField type="search" name="q" aria-label="Album or artist" placeholder="Search an album or artist" className={styles.search} />
          <Button type="submit" variant="primary">
            Search
          </Button>
        </InlineForm>
      </Stack>

      <Stack as="section" gap={4} aria-labelledby="home-library">
        <SectionLabel as="h2" id="home-library">
          02 / Library
        </SectionLabel>
        <p>{albums === 0 ? "No albums in your library yet." : plural(albums, "album")}</p>
        <div>
          <ButtonLink href="/library">View library</ButtonLink>
        </div>
      </Stack>

      <Stack as="section" gap={4} aria-labelledby="home-play">
        <SectionLabel as="h2" id="home-play">
          03 / Play
        </SectionLabel>
        {progress ? (
          <>
            <RankingProgress progress={progress} showPlay={false} />
            <div>
              <ButtonLink href="/matchups" variant="primary">
                Play matchups
              </ButtonLink>
            </div>
          </>
        ) : (
          <EmptyState action={<ButtonLink href="/search">Search albums</ButtonLink>}>
            Add at least two albums to your library to start matchups.
          </EmptyState>
        )}
      </Stack>

      {ranking.length > 0 && (
        <Stack as="section" gap={4} aria-labelledby="home-rankings">
          <SectionLabel as="h2" id="home-rankings">
            04 / Rankings
          </SectionLabel>
          <ol className={styles.top}>
            {ranking.slice(0, TOP_ALBUMS).map(({ rank, album }) => (
              <li key={album.albumId} className={styles.topRow}>
                <span className={styles.rank} aria-hidden="true">{rank}</span>
                <Cover src={album.coverUrl} alt={`Cover of ${album.title}`} size={80} />
                <div className={styles.topText}>
                  <strong>{album.title}</strong>
                  <Link href={`/artists/${album.artistId}`}>{album.artistName}</Link>
                </div>
              </li>
            ))}
          </ol>
          <Cluster>
            <ButtonLink href="/analytics">See the rankings</ButtonLink>
          </Cluster>
        </Stack>
      )}
    </Stack>
  );
}
