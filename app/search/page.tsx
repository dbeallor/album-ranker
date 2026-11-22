import Link from "next/link";
import { Cover } from "@/components/cover";
import { Button } from "@/components/ui/button";
import { Cluster } from "@/components/ui/cluster";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineForm } from "@/components/ui/inline-form";
import { ListRow } from "@/components/ui/list-row";
import { Message } from "@/components/ui/message";
import { PageHeader } from "@/components/ui/page-header";
import { Stack } from "@/components/ui/stack";
import { TextField } from "@/components/ui/text-field";
import { searchAlbums } from "@/lib/catalog/search";
import { libraryYearsByCatalogId } from "@/lib/db/library";
import { getDb } from "@/lib/db/server";
import { addToLibraryAction } from "./actions";
import styles from "./page.module.css";

type Param = string | string[] | undefined;
type SearchParams = Promise<{ q?: Param; added?: Param; error?: Param; item?: Param }>;

function first(param: Param): string {
  return (Array.isArray(param) ? param[0] : param) ?? "";
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = first(params.q);
  const result = query.trim() === "" ? null : await searchAlbums(query);
  const albums = result?.ok ? result.albums : [];
  const libraryYears = libraryYearsByCatalogId(
    getDb(),
    albums.map((album) => album.catalogId),
  );

  const addedId = first(params.added);
  const added = addedId === "" ? undefined : albums.find((album) => album.catalogId === addedId && libraryYears.has(album.catalogId));
  const errorMessage = first(params.error);
  const errorItem = first(params.item);

  return (
    <>
      <PageHeader label="01 / Add albums" title="Add albums" />
      <Stack gap={5}>
        <InlineForm method="get" action="/search">
          <TextField type="search" name="q" defaultValue={query} aria-label="Album or artist" placeholder="Search an album or artist" className={styles.search} />
          <Button type="submit" variant="primary">
            Search
          </Button>
        </InlineForm>

        {added && (
          <Message tone="success" role="status">
            Added {added.title} to your library.
            <Cluster gap={3}>
              <Link href="/library?sort=year">View library</Link>
              <Link href="/matchups">Play matchups</Link>
            </Cluster>
          </Message>
        )}
        {result && !result.ok && (
          <Message tone="error" role="alert">
            {result.message}
          </Message>
        )}
        {result?.ok && albums.length === 0 && <EmptyState>No albums found for &quot;{query.trim()}&quot;.</EmptyState>}
        {albums.length > 0 && (
          <Stack as="ul" gap={1}>
            {albums.map((album) => {
              const libraryYear = libraryYears.get(album.catalogId);
              return (
                <li key={album.catalogId} className={styles.result}>
                  <ListRow
                    className={styles.resultRow}
                    coverClassName={styles.resultCover}
                    cover={<Cover src={album.coverUrl} alt={`Cover of ${album.title}`} size={160} />}
                    title={album.title}
                    subtitle={album.artist}
                    meta={libraryYear === undefined ? (album.year ?? "Unknown year") : `In your library (${libraryYear})`}
                  >
                    {libraryYear === undefined && (
                      <form action={addToLibraryAction}>
                        <input type="hidden" name="q" value={query} />
                        <input type="hidden" name="catalogId" value={album.catalogId} />
                        <input type="hidden" name="title" value={album.title} />
                        <input type="hidden" name="artist" value={album.artist} />
                        <input type="hidden" name="artistId" value={album.artistId ?? ""} />
                        <input type="hidden" name="releaseYear" value={album.year ?? ""} />
                        <input type="hidden" name="coverUrl" value={album.coverUrl} />
                        <Cluster align="end" gap={3}>
                          <TextField
                            label="Year in your library"
                            name="year"
                            type="number"
                            min={1900}
                            max={2100}
                            required
                            defaultValue={album.year ?? ""}
                            hint={album.year === null ? "The catalog has no year. Enter the year to file it under." : undefined}
                            fieldClassName={styles.year}
                          />
                          <Button type="submit" variant="primary">
                            Add to library
                          </Button>
                        </Cluster>
                      </form>
                    )}
                    {errorMessage !== "" && errorItem === album.catalogId && (
                      <Message tone="error" role="alert">
                        {errorMessage}
                      </Message>
                    )}
                  </ListRow>
                </li>
              );
            })}
          </Stack>
        )}
      </Stack>
    </>
  );
}
