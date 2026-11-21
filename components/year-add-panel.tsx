"use client";

import { useState, type FormEvent } from "react";
import { Cover } from "@/components/cover";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineForm } from "@/components/ui/inline-form";
import { ListRow } from "@/components/ui/list-row";
import { Message } from "@/components/ui/message";
import { Select } from "@/components/ui/select";
import { Stack } from "@/components/ui/stack";
import { TextField } from "@/components/ui/text-field";
import type { CatalogAlbum, SearchResult } from "@/lib/catalog/types";
import type { Area } from "@/lib/year-placements";
import styles from "./year-add-panel.module.css";

export type ManualInput = { title: string; artist: string; releaseYear: number | null; area: Area };

type Props = {
  /** Add buttons and the manual form are off while a save or another add is running. */
  disabled: boolean;
  rankedFull: boolean;
  searchAction: (query: string) => Promise<SearchResult>;
  onAddCatalog: (album: CatalogAlbum, area: Area) => void;
  /** Resolves true when the album was added, so the form can clear. */
  onAddManual: (input: ManualInput) => Promise<boolean>;
};

const AREA_NAMES: Record<Area, string> = {
  ranked: "ranked",
  honorable_mention: "honorable mentions",
  listed: "listed",
};
const AREAS: Area[] = ["ranked", "honorable_mention", "listed"];

export function YearAddPanel({ disabled, rankedFull, searchAction, onAddCatalog, onAddManual }: Props) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState<string | null>(null);
  const [results, setResults] = useState<CatalogAlbum[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [releaseYear, setReleaseYear] = useState("");
  const [area, setArea] = useState<Area>("listed");

  // The form's area can't stay on ranked once ranked is full.
  if (rankedFull && area === "ranked") setArea("listed");

  async function search(event: FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (text === "") return;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await searchAction(text);
      if (result.ok) {
        setResults(result.albums);
        setSearched(text);
      } else {
        setSearchError(result.message);
      }
    } catch {
      setSearchError("Something went wrong. Try again.");
    } finally {
      setSearching(false);
    }
  }

  async function addManual(event: FormEvent) {
    event.preventDefault();
    const added = await onAddManual({
      title,
      artist,
      releaseYear: releaseYear.trim() === "" ? null : Number(releaseYear),
      area,
    });
    if (added) {
      setTitle("");
      setArtist("");
      setReleaseYear("");
    }
  }

  return (
    <Card as="section" aria-labelledby="add-heading">
      <Stack gap={4}>
        <h2 id="add-heading">Add an album</h2>

        <InlineForm onSubmit={search} role="search">
          <TextField type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Album or artist" />
          <Button type="submit" variant="primary" disabled={searching}>
            Search
          </Button>
        </InlineForm>

        {searchError && (
          <Message tone="error" role="alert">
            {searchError}
          </Message>
        )}
        {searched !== null && results.length === 0 && <EmptyState>No albums found for &quot;{searched}&quot;.</EmptyState>}
        {results.length > 0 && (
          <>
            {rankedFull && <Message tone="info">Ranked is full: add to honorable mentions or move one out first.</Message>}
            <ul className={styles.results}>
              {results.map((album) => (
                <ListRow
                  as="li"
                  key={album.catalogId}
                  cover={<Cover src={album.coverUrl} alt={`Cover of ${album.title}`} size={80} />}
                  title={album.title}
                  subtitle={album.artist}
                  meta={album.year ?? "Unknown year"}
                  actions={AREAS.map((target) => (
                    <Button
                      key={target}
                      type="button"
                      disabled={disabled || (target === "ranked" && rankedFull)}
                      onClick={() => onAddCatalog(album, target)}
                    >
                      Add to {AREA_NAMES[target]}
                    </Button>
                  ))}
                />
              ))}
            </ul>
          </>
        )}

        <div>
          <Button type="button" aria-expanded={manualOpen} onClick={() => setManualOpen((open) => !open)}>
            Can&apos;t find it? Add it by hand
          </Button>
        </div>
        {manualOpen && (
          <Stack as="form" gap={3} className={styles.manualForm} onSubmit={addManual}>
            <TextField label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />
            <TextField label="Artist" value={artist} onChange={(event) => setArtist(event.target.value)} required />
            <TextField
              label="Release year (optional)"
              type="number"
              step={1}
              value={releaseYear}
              onChange={(event) => setReleaseYear(event.target.value)}
            />
            <Select label="Add to" value={area} onChange={(event) => setArea(event.target.value as Area)}>
              {AREAS.map((target) => (
                <option key={target} value={target} disabled={target === "ranked" && rankedFull}>
                  {AREA_NAMES[target]}
                </option>
              ))}
            </Select>
            <div>
              <Button type="submit" variant="primary" disabled={disabled}>
                Add album
              </Button>
            </div>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
