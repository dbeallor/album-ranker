import { Cover } from "@/components/cover";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineForm } from "@/components/ui/inline-form";
import { ListRow } from "@/components/ui/list-row";
import { Message } from "@/components/ui/message";
import { PageHeader } from "@/components/ui/page-header";
import { Stack } from "@/components/ui/stack";
import { TextField } from "@/components/ui/text-field";
import { searchAlbums } from "@/lib/catalog/search";

type SearchParams = Promise<{ q?: string | string[] }>;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q) ?? "";
  const result = query.trim() === "" ? null : await searchAlbums(query);

  return (
    <>
      <PageHeader title="Search albums" />
      <Stack gap={5}>
        <InlineForm method="get" action="/search">
          <TextField type="search" name="q" defaultValue={query} aria-label="Album or artist" />
          <Button type="submit" variant="primary">
            Search
          </Button>
        </InlineForm>

        {result && !result.ok && (
          <Message tone="error" role="alert">
            {result.message}
          </Message>
        )}
        {result?.ok && result.albums.length === 0 && <EmptyState>No albums found for &quot;{query.trim()}&quot;.</EmptyState>}
        {result?.ok && result.albums.length > 0 && (
          <Stack as="ul" gap={3}>
            {result.albums.map((album) => (
              <Card as="li" key={album.catalogId}>
                <ListRow
                  cover={<Cover src={album.coverUrl} alt={`Cover of ${album.title}`} />}
                  title={album.title}
                  subtitle={album.artist}
                  meta={album.year ?? "Unknown year"}
                />
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </>
  );
}
