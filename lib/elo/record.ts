import type { ReplayMatchup } from "./replay";

export type AlbumRecord = {
  played: number;
  wins: number;
  losses: number;
  ties: number;
  /** The latest `createdAt` among the counted matchups, or null with none. */
  lastAt: string | null;
};

/** Per album id: matchups played, wins, losses, ties and the last matchup date, from the matchups the replay used. Every id in `albumIds` gets an entry. */
export function computeRecords(
  albumIds: number[],
  used: Pick<ReplayMatchup, "albumAId" | "albumBId" | "result" | "createdAt">[],
): Map<number, AlbumRecord> {
  const records = new Map<number, AlbumRecord>(
    albumIds.map((id) => [id, { played: 0, wins: 0, losses: 0, ties: 0, lastAt: null }]),
  );
  const add = (albumId: number, outcome: "wins" | "losses" | "ties", createdAt: string) => {
    const record = records.get(albumId);
    if (!record) return;
    record.played++;
    record[outcome]++;
    if (record.lastAt === null || createdAt > record.lastAt) record.lastAt = createdAt;
  };
  for (const { albumAId, albumBId, result, createdAt } of used) {
    add(albumAId, result === "a" ? "wins" : result === "b" ? "losses" : "ties", createdAt);
    add(albumBId, result === "b" ? "wins" : result === "a" ? "losses" : "ties", createdAt);
  }
  return records;
}

/** "3-1-0": wins, losses, ties. */
export function formatRecord({ wins, losses, ties }: Pick<AlbumRecord, "wins" | "losses" | "ties">): string {
  return `${wins}-${losses}-${ties}`;
}
