export type Config = {
  databasePath: string;
  musicbrainzUserAgent: string;
};

const DEFAULT_DATABASE_PATH = "./data/album-ranker.db";
const DEFAULT_MUSICBRAINZ_USER_AGENT = "album-ranker/0.1";

function readSetting(name: string, fallback: string, hint: string): string {
  const raw = process.env[name];

  if (raw === undefined) {
    return fallback;
  }
  if (raw.trim() === "") {
    throw new Error(`${name} is set but empty. ${hint}`);
  }
  return raw;
}

export function getConfig(): Config {
  return {
    databasePath: readSetting(
      "DATABASE_PATH",
      DEFAULT_DATABASE_PATH,
      "Set it to a file path, or unset it to use the default.",
    ),
    musicbrainzUserAgent: readSetting(
      "MUSICBRAINZ_USER_AGENT",
      DEFAULT_MUSICBRAINZ_USER_AGENT,
      "Set it to a User-Agent string, or unset it to use the default.",
    ),
  };
}
