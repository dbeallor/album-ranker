import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Cover } from "@/components/cover";
import { RankingProgress } from "@/components/ranking-progress";
import { Button } from "@/components/ui/button";
import { Cluster } from "@/components/ui/cluster";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Stack } from "@/components/ui/stack";
import { Table } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { ANALYTICS_VIEWS, loadAnalytics, type AnalyticsView } from "@/lib/analytics";
import { getDb } from "@/lib/db/server";
import { formatRecord } from "@/lib/elo/record";
import { scopeChoices } from "@/lib/library-view";
import { ERAS, LIFETIME, parseScope, scopeLabel, scopeValue, type Scope } from "@/lib/scopes";
import styles from "./page.module.css";

type Param = string | string[] | undefined;
// A stray param, such as the `decade` an old link carries, is simply never read.
type SearchParams = Promise<{ view?: Param; scope?: Param }>;

const DEFAULT_VIEW: AnalyticsView = "albums";

function href(view: AnalyticsView, scope?: Scope): string {
  return scope ? `/analytics?view=${view}&scope=${scopeValue(scope)}` : `/analytics?view=${view}`;
}

const round = (value: number) => Math.round(value);

export default async function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // ratings are replayed per request, not at build time
  const params = await searchParams;

  const view: AnalyticsView =
    ANALYTICS_VIEWS.find((option) => typeof params.view === "string" && option.value === params.view)?.value ?? DEFAULT_VIEW;
  let scope = LIFETIME;
  if (params.scope !== undefined) {
    const parsed = typeof params.scope === "string" ? parseScope(params.scope) : null;
    if (!parsed) notFound();
    scope = parsed;
  }

  const { data, libraryAlbums, progress } = loadAnalytics(getDb(), view, scope);
  const ranked = view === "albums" || view === "artists";
  const choices = scopeChoices(libraryAlbums, scope);
  const emptyMessage = ranked && scope.kind !== "lifetime" ? `No albums in ${scopeLabel(scope)} yet.` : "No albums in the library yet.";

  return (
    <>
      <PageHeader
        title="Analytics"
        description={ranked ? `${view === "albums" ? "Album" : "Artist"} ranking · ${scopeLabel(scope)}` : undefined}
      />
      <Stack gap={5}>
        <RankingProgress progress={progress} />
        <Tabs
          aria-label="Analytics view"
          items={ANALYTICS_VIEWS.map((option) => ({
            href: option.value === "albums" || option.value === "artists" ? href(option.value, ranked ? scope : LIFETIME) : href(option.value),
            label: option.label,
            current: option.value === view,
          }))}
        />

        {ranked ? (
          <Stack gap={3}>
            <Tabs
              aria-label="Scope"
              items={[LIFETIME, ...ERAS.map((era): Scope => ({ kind: "era", era: era.key }))].map((choice) => ({
                href: href(view, choice),
                label: scopeLabel(choice),
                current: scopeValue(choice) === scopeValue(scope),
              }))}
            />
            <Cluster align="end" gap={3}>
              <ScopePicker view={view} label="Decade" kind="decade" scope={scope} choices={choices.decades} />
              <ScopePicker view={view} label="Year" kind="year" scope={scope} choices={choices.years} />
            </Cluster>
          </Stack>
        ) : null}

        {data.rows.length === 0 ? (
          <EmptyState>{emptyMessage}</EmptyState>
        ) : data.view === "albums" ? (
          <Table label={`Album ranking, ${scopeLabel(scope)}`}>
            <thead>
              <tr>
                <th data-numeric>Rank</th>
                <th>Cover</th>
                <th>Title</th>
                <th>Artist</th>
                <th data-numeric>Year</th>
                <th data-numeric>Rating</th>
                <th data-numeric>Played</th>
                <th data-numeric>W-L-T</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map(({ rank, album }) => (
                <tr key={album.albumId}>
                  <td data-numeric>{rank}</td>
                  <td>
                    <Cover src={album.coverUrl} alt={`Cover of ${album.title}`} size={40} />
                  </td>
                  <th scope="row">{album.title}</th>
                  <td>
                    <Link href={`/artists/${album.artistId}`}>{album.artistName}</Link>
                  </td>
                  <td data-numeric>{album.year}</td>
                  <td data-numeric>{round(album.rating)}</td>
                  <td data-numeric>{album.played}</td>
                  <td data-numeric>{formatRecord(album)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : data.view === "artists" ? (
          <Table label={`Artist ranking, ${scopeLabel(scope)}`}>
            <thead>
              <tr>
                <th data-numeric>Rank</th>
                <th>Artist</th>
                <th data-numeric>Score</th>
                <th data-numeric>Albums</th>
                <th>Best album</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.artistId}>
                  <td data-numeric>{row.rank}</td>
                  <th scope="row">
                    <Link href={`/artists/${row.artistId}`}>{row.artistName}</Link>
                  </th>
                  <td data-numeric>{round(row.score)}</td>
                  <td data-numeric>{row.albumCount}</td>
                  <td>{row.bestAlbum.title}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Table label={`${ANALYTICS_VIEWS.find((option) => option.value === view)!.label} summary`}>
            <thead>
              <tr>
                <th>Period</th>
                <th data-numeric>Albums</th>
                <th data-numeric>Matchups played</th>
                <th data-numeric>Average rating</th>
                <th>Top album</th>
                <th>Top artist</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={scopeValue(row.scope)}>
                  <th scope="row">
                    <Link href={href("albums", row.scope)}>{row.label}</Link>
                  </th>
                  <td data-numeric>{row.albumCount}</td>
                  <td data-numeric>{row.matchups}</td>
                  <td data-numeric>{round(row.averageRating)}</td>
                  <td>{row.topAlbum.title}</td>
                  <td>
                    <Link href={`/artists/${row.topArtist.artistId}`}>{row.topArtist.name}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Stack>
    </>
  );
}

/** A GET form that picks one decade or year, keeping the view. With nothing chosen nothing is submitted, so the page shows Lifetime. */
function ScopePicker({
  view,
  label,
  kind,
  scope,
  choices,
}: {
  view: AnalyticsView;
  label: string;
  kind: "decade" | "year";
  scope: Scope;
  choices: { value: string; label: string }[];
}) {
  if (choices.length === 0) return null;
  return (
    <form action="/analytics" method="get" className={styles.picker}>
      <Cluster align="end" gap={2}>
        <input type="hidden" name="view" value={view} />
        <Select label={label} name="scope" defaultValue={scope.kind === kind ? scopeValue(scope) : ""}>
          <option value="" disabled>
            Choose
          </option>
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
        <Button type="submit">Show</Button>
      </Cluster>
    </form>
  );
}
