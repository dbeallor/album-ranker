# As-built: Record browser events on any local app or preview

**Shipped:** in PR #32
**Ticket:** ALBUM-30
**Spec:** [2026-11-21-album-30-record-local-previews.md](../specs/2026-11-21-album-30-record-local-previews.md)

## Differs from the spec

- The spec says a port or URL target works for any loopback address. A bare number from 1 to 999 is read as a ticket, 1024 to 65535 as a port, and 1000 to 1023 is refused. `host:port` without a scheme is refused with a hint.
- The spec says `source` for a non-preview port comes from the process listening there. When two processes listen on one port (one per address family), `source` holds only `host`, since which one the browser reaches is unknown.
- The command checks that the URL answers before opening the window, and exits 1 with a hint if not.
- For main, `commit` comes only from the preview record; a record from before this change has no `commit`, and the field is left out.
- `runSession` also takes `headless`, `signal`, `drive` and `saveEveryMs`, so a script can run a session without a window.
- `kind: "dev"` also matches when the listener's parent process runs `next dev`, because Next serves from a child process.
