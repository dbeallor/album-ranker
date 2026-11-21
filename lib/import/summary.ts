import type { ImportSummary } from "./run.ts";
import { describeKey } from "./types.ts";

const LABEL_WIDTH = 23;

function line(label: string, count: number | string, note = ""): string {
  return `${label.padEnd(LABEL_WIDTH)}${String(count).padEnd(5)}${note}`.trimEnd();
}

function listed(label: string, items: { name: string; note: string }[], note = ""): string[] {
  if (items.length === 0) return [line(label, 0, note)];
  const [first, ...rest] = items;
  const entry = ({ name, note: detail }: { name: string; note: string }) => (detail ? `${name}: ${detail}` : name);
  return [
    line(label, items.length, entry(first)),
    ...rest.map((item) => `${" ".repeat(LABEL_WIDTH + 5)}${entry(item)}`),
  ];
}

/** The text the script prints at the end of a run. */
export function formatSummary(summary: ImportSummary): string {
  const { review } = summary;
  const reviewTotal = review.no_match + review.ambiguous + review.duplicate_album + review.rank_taken;
  const lines = [
    line("Rows read", summary.rowsRead),
    line("Imported", summary.imported, "(matched automatically)"),
    line(
      "Sent to review",
      reviewTotal,
      `(no match ${review.no_match}, ambiguous ${review.ambiguous}, duplicate album match ${review.duplicate_album}, rank taken ${review.rank_taken})`,
    ),
    ...listed(
      "Merged duplicates",
      summary.merged.map(({ row, difference }) => ({ name: describeKey(row.key), note: difference ?? "" })),
    ),
    ...listed(
      "Conflicting placement",
      summary.conflictingPlacement.map((row) => ({
        name: describeKey(row.key),
        note: `rank ${row.conflictingPlacement?.droppedRank} and honorable mention, imported as honorable mention`,
      })),
    ),
    ...listed(
      "Decade rank dropped",
      summary.droppedDecadeRank.map((row) => ({
        name: describeKey(row.key),
        note: row.droppedDecadeRank ?? "",
      })),
    ),
    ...listed(
      "Decade list full",
      summary.decadeListFull.map((row) => ({ name: describeKey(row.key), note: "not added to the decade list" })),
    ),
    line("Already imported", summary.alreadyImported),
    ...listed(
      "Invalid, skipped",
      summary.invalid.map((row) => ({
        name: `row ${row.rowNumber}${row.album ? ` ${row.album}` : ""}`,
        note: row.reason,
      })),
    ),
    line("Not reached", summary.notReached, "re-run to retry"),
    line(
      "Decade lists",
      "",
      summary.decadeLists.length === 0
        ? "none yet"
        : `${summary.decadeLists.map(({ decade, entries }) => `${decade}s ${entries}`).join(", ")} (entries now on each list)`,
    ),
    line("Open review items", summary.openReviewItems, summary.openReviewItems > 0 ? "see /import" : ""),
  ];
  if (summary.aborted) {
    lines.push("", "Stopped early: the catalog failed on 10 rows in a row. Try again later; the run carries on where it stopped.");
  }
  return lines.join("\n");
}
