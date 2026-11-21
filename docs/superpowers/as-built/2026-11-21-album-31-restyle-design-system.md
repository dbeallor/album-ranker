# As-built: Restyle the whole app with one shared design system

**Shipped:** in PR #33
**Ticket:** ALBUM-31
**Spec:** [2026-11-21-album-31-restyle-design-system.md](../specs/2026-11-21-album-31-restyle-design-system.md)

## Differs from the spec

- The spec lists 12 shared components; three more shipped: `InlineForm` (search and "Go to year" rows), `CardGrid` and `LinkCard` (home, years and decades pickers). Extra tokens: `--color-danger-text`, `--color-success-soft`, `--color-shadow`, `--duration`, `--gutter`, `--focus-offset`.
- The header is sticky from 640px up only; on phones the wrapped two-row nav would take too much of the screen.
- `Tabs` renders the current item as a `span` with `aria-current="page"`, not a link.
- `Table` is a focusable, labelled scroll region (`label` prop required).
- The years and decades pickers are card grids, not plain row lists; artist page covers are 80px.
- `/import` has no page-level change; `ImportReview` renders its own `PageHeader`.
