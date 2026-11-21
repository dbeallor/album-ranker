"use client";

import { useState, type FormEvent } from "react";
import { Cover } from "@/components/cover";
import type { CatalogAlbum, SearchResult } from "@/lib/catalog/types";
import type { Area } from "@/lib/year-placements";

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
    <section aria-labelledby="add-heading">
      <h2 id="add-heading">Add an album</h2>

      <form onSubmit={search} role="search">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Album or artist"
        />{" "}
        <button type="submit" disabled={searching}>
          Search
        </button>
      </form>

      {searchError && <p role="alert">{searchError}</p>}
      {searched !== null && results.length === 0 && <p>No albums found for &quot;{searched}&quot;.</p>}
      {results.length > 0 && (
        <>
          {rankedFull && <p>Ranked is full: add to honorable mentions or move one out first.</p>}
          <ul style={{ listStyle: "none", padding: 0 }}>
            {results.map((album) => (
              <li key={album.catalogId} style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <Cover src={album.coverUrl} alt={`Cover of ${album.title}`} size={80} />
                <div>
                  <strong>{album.title}</strong>
                  <div>{album.artist}</div>
                  <div>{album.year ?? "Unknown year"}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {AREAS.map((target) => (
                      <button
                        key={target}
                        type="button"
                        disabled={disabled || (target === "ranked" && rankedFull)}
                        onClick={() => onAddCatalog(album, target)}
                      >
                        Add to {AREA_NAMES[target]}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p>
        <button type="button" aria-expanded={manualOpen} onClick={() => setManualOpen((open) => !open)}>
          Can&apos;t find it? Add it by hand
        </button>
      </p>
      {manualOpen && (
        <form onSubmit={addManual} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
          <label>
            Title <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            Artist <input value={artist} onChange={(event) => setArtist(event.target.value)} required />
          </label>
          <label>
            Release year (optional){" "}
            <input
              type="number"
              step={1}
              value={releaseYear}
              onChange={(event) => setReleaseYear(event.target.value)}
            />
          </label>
          <label>
            Add to{" "}
            <select value={area} onChange={(event) => setArea(event.target.value as Area)}>
              {AREAS.map((target) => (
                <option key={target} value={target} disabled={target === "ranked" && rankedFull}>
                  {AREA_NAMES[target]}
                </option>
              ))}
            </select>
          </label>
          <div>
            <button type="submit" disabled={disabled}>
              Add album
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
