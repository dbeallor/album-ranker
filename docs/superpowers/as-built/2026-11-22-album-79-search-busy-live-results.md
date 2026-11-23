# As-built: Fix the catalog busy error on search and show results while typing

**Shipped:** in PR #81
**Ticket:** ALBUM-79
**Spec:** [2026-11-22-album-79-search-busy-live-results.md](../specs/2026-11-22-album-79-search-busy-live-results.md)

## Differs from the spec

- The spec says the box's value is its own state, seeded from `?q=` on first render. It also follows a changed `?q=` that wasn't its own search (the header "Add albums" link, Back), unless a search is in flight. Found in code review: without it the box could show text that didn't match the results.
- The duplicate check collapses inner spaces, like the length check, and the "Searching…" `role="status"` element stays mounted with empty text when idle, so screen readers announce it.
- The e2e typing test types "stan getz", not "getz gilberto", since an earlier e2e test already cached "getz gilberto" (the 24 h cache would make the request count 0). The stub gained a `/__count` path for the request count.
- The existing test "does not cache an error" uses a 500 instead of a 503, since a 503 now retries.
- The big search box CSS moved from `page.module.css` to `search-box.module.css`.
