import "server-only";
import { getConfig } from "../config";
import { createResolveCover } from "./cover-art";

/** The cover lookup the server actions use: real fetch, MusicBrainz's user agent from the config. */
export const resolveCover = createResolveCover({
  fetch: (input, init) => fetch(input, init),
  userAgent: () => getConfig().musicbrainzUserAgent,
});
