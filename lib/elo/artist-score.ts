import { START_RATING } from "./elo";

/** `(sum of ratings + 1500) / (album count + 1)`, or undefined for an artist with no rated albums. */
export function artistScore(ratings: number[]): number | undefined {
  if (ratings.length === 0) return undefined;
  return (ratings.reduce((sum, rating) => sum + rating, 0) + START_RATING) / (ratings.length + 1);
}

/** The score over the albums whose year is in the decade (1960 means 1960 to 1969). */
export function decadeArtistScore(albums: { year: number; rating: number }[], decade: number): number | undefined {
  return artistScore(albums.filter((album) => Math.floor(album.year / 10) * 10 === decade).map((album) => album.rating));
}
