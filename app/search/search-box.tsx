"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { InlineForm } from "@/components/ui/inline-form";
import { Stack } from "@/components/ui/stack";
import { TextField } from "@/components/ui/text-field";
import styles from "./search-box.module.css";

const PAUSE_MS = 500;
const MIN_LENGTH = 2;

/**
 * The search form. It still submits as a plain GET, and it also updates `?q=` after a pause in typing, so the server page
 * shows results without Search. One search is on the server at a time; the latest text wins.
 */
export function SearchBox({ query }: { query: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(query);
  const latest = useRef(query);
  const lastSent = useRef(query.trim());
  // A search is in flight from the moment it is sent until `isPending` has shown true and then false again.
  const inFlight = useRef(false);
  const sawPending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function clearTimer() {
    clearTimeout(timer.current);
    timer.current = undefined;
  }

  function sendLatest() {
    timer.current = undefined;
    if (inFlight.current) {
      return;
    }
    const text = latest.current.trim();
    const length = text.replace(/\s+/g, " ").length;
    if (text === lastSent.current || (length > 0 && length < MIN_LENGTH)) {
      return;
    }
    lastSent.current = text;
    inFlight.current = true;
    sawPending.current = false;
    const url = text === "" ? "/search" : `/search?${new URLSearchParams({ q: text })}`;
    startTransition(() => {
      router.replace(url, { scroll: false });
    });
  }

  // When a search finishes, send the text typed meanwhile, unless a pause is still running (it will send then).
  useEffect(() => {
    if (isPending) {
      sawPending.current = true;
    } else if (inFlight.current && sawPending.current) {
      inFlight.current = false;
      if (timer.current === undefined) {
        sendLatest();
      }
    }
  });

  useEffect(() => clearTimer, []);

  return (
    <Stack gap={1}>
      <InlineForm method="get" action="/search" onSubmit={clearTimer}>
        <TextField
          type="search"
          name="q"
          value={value}
          onChange={(event) => {
            latest.current = event.target.value;
            setValue(event.target.value);
            clearTimer();
            timer.current = setTimeout(sendLatest, PAUSE_MS);
          }}
          aria-label="Album or artist"
          placeholder="Search an album or artist"
          className={styles.search}
        />
        <Button type="submit" variant="primary">
          Search
        </Button>
      </InlineForm>
      {isPending && (
        <p role="status" className={styles.status}>
          Searching…
        </p>
      )}
    </Stack>
  );
}
