import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Cover } from "@/components/cover";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CardGrid } from "@/components/ui/card-grid";
import { Cluster } from "@/components/ui/cluster";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Message } from "@/components/ui/message";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Stack } from "@/components/ui/stack";
import { TextField } from "@/components/ui/text-field";
import { getDb } from "@/lib/db/server";
import { formatRecord } from "@/lib/elo/record";
import { loadLibraryAlbums } from "@/lib/library-albums";
import {
  buildLibraryView,
  DEFAULT_SORT,
  PLAYED_FILTERS,
  scopeChoices,
  SORT_KEYS,
  SORT_LABELS,
  type PlayedFilter,
  type SortDir,
  type SortKey,
} from "@/lib/library-view";
import { LIFETIME, parseScope, scopeValue } from "@/lib/scopes";
import styles from "./page.module.css";

type Param = string | string[] | undefined;
type SearchParams = Promise<{ sort?: Param; dir?: Param; q?: Param; scope?: Param; played?: Param; removed?: Param; matchups?: Param }>;

/** A search param that is one of `allowed`, else undefined (a repeated param counts as bad). */
function oneOf<T extends string>(value: Param, allowed: readonly T[]): T | undefined {
  return typeof value === "string" ? allowed.find((option) => option === value) : undefined;
}

function first(value: Param): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function removedMessage(title: string, matchupsParam: string): string {
  const matchups = /^\d+$/.test(matchupsParam) ? Number(matchupsParam) : 0;
  if (matchups === 0) return `Removed ${title}.`;
  return `Removed ${title} and its ${matchups} ${matchups === 1 ? "matchup" : "matchups"}.`;
}

export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // ratings are replayed per request, not at build time
  const params = await searchParams;

  const sort: SortKey = oneOf(params.sort, SORT_KEYS) ?? DEFAULT_SORT;
  const dir: SortDir | undefined = oneOf(params.dir, ["asc", "desc"]);
  const played: PlayedFilter = oneOf(params.played, ["all", "played", "unplayed"]) ?? "all";
  const q = typeof params.q === "string" ? params.q.trim() : "";
  let scope = LIFETIME;
  if (params.scope !== undefined) {
    const parsed = typeof params.scope === "string" ? parseScope(params.scope) : null;
    if (!parsed) notFound();
    scope = parsed;
  }

  const albums = loadLibraryAlbums(getDb());
  const groups = buildLibraryView(albums, { sort, dir, q, scope, played });
  const shown = groups.reduce((total, group) => total + group.albums.length, 0);
  const choices = scopeChoices(albums, scope);
  const removed = first(params.removed);

  return (
    <>
      <PageHeader title="Library" description={`${shown} of ${albums.length} ${albums.length === 1 ? "album" : "albums"}`} />
      <Stack gap={5}>
        {removed !== "" && (
          <Message tone="success" role="status">
            {removedMessage(removed, first(params.matchups))}
          </Message>
        )}
        <form action="/library" method="get">
          <Cluster align="end" gap={3}>
            <Select label="Sort by" name="sort" fieldClassName={styles.field} defaultValue={sort}>
              {SORT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {SORT_LABELS[key]}
                </option>
              ))}
            </Select>
            <Select label="Direction" name="dir" fieldClassName={styles.field} defaultValue={dir ?? ""}>
              <option value="">Default for this sort</option>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </Select>
            <TextField label="Title or artist" name="q" fieldClassName={styles.field} type="search" defaultValue={q} />
            <Select label="Scope" name="scope" fieldClassName={styles.field} defaultValue={scopeValue(scope)}>
              <option value="lifetime">Lifetime</option>
              <optgroup label="Era">
                {choices.eras.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Decade">
                {choices.decades.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Year">
                {choices.years.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </optgroup>
            </Select>
            <Select label="Matchups" name="played" fieldClassName={styles.field} defaultValue={played}>
              {PLAYED_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="primary">
              Apply
            </Button>
          </Cluster>
        </form>

        {groups.length === 0 ? (
          <EmptyState>{albums.length === 0 ? "No albums in the library yet." : "No albums match these filters."}</EmptyState>
        ) : (
          groups.map((group, index) => (
            <section key={index} className={styles.group}>
              {group.heading ? <h2>{group.heading}</h2> : null}
              <CardGrid>
                {group.albums.map((album) => (
                  <Card as="li" key={album.albumId}>
                    <ListRow
                      cover={<Cover src={album.coverUrl} alt={`Cover of ${album.title}`} size={80} />}
                      title={album.title}
                      subtitle={<Link href={`/artists/${album.artistId}`}>{album.artistName}</Link>}
                      meta={`${album.year} · Rating ${Math.round(album.rating)} · Rank ${album.rank} · W-L-T ${formatRecord(album)}`}
                      actions={
                        <ButtonLink href={`/library/remove/${album.albumId}`} variant="ghost">
                          Remove
                        </ButtonLink>
                      }
                    />
                  </Card>
                ))}
              </CardGrid>
            </section>
          ))
        )}
      </Stack>
    </>
  );
}
