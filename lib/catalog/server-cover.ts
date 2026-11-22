import "server-only";
import { getConfig } from "../config";
import { createResolveCover } from "./cover-art";

/** The cover lookup the server actions use: real fetch, with the user agent and the two base URLs from the config, paced by the real clock. */
export const resolveCover = createResolveCover({
  fetch: (input, init) => fetch(input, init),
  userAgent: () => getConfig().musicbrainzUserAgent,
  caaUrl: () => getConfig().coverArtArchiveUrl,
  deezerUrl: () => getConfig().deezerUrl,
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});
