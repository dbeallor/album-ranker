/** Joins the truthy class names, so components can add a caller's `className` to their own. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

/** The spacing scale the layout helpers accept, as `--space-N` tokens. */
export type Gap = 1 | 2 | 3 | 4 | 5 | 6 | 7;
