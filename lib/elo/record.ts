import type { ReplayMatchup } from "./replay";

export type AlbumRecord = { played: number; wins: number; losses: number; ties: number };

/** Per album id: matchups played, wins, losses and ties, from the matchups the replay used. Every id in `albumIds` gets an entry. */
export function computeRecords(
  albumIds: number[],
  used: Pick<ReplayMatchup, "albumAId" | "albumBId" | "result">[],
): Map<number, AlbumRecord> {
  const records = new Map<number, AlbumRecord>(
    albumIds.map((id) => [id, { played: 0, wins: 0, losses: 0, ties: 0 }]),
  );
  const add = (albumId: number, outcome: "wins" | "losses" | "ties") => {
    const record = records.get(albumId);
    if (!record) return;
    record.played++;
    record[outcome]++;
  };
  for (const { albumAId, albumBId, result } of used) {
    add(albumAId, result === "a" ? "wins" : result === "b" ? "losses" : "ties");
    add(albumBId, result === "b" ? "wins" : result === "a" ? "losses" : "ties");
  }
  return records;
}
