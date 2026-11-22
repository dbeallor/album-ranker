import { homedir } from "node:os";
import { join } from "node:path";

export type Config = {
  databasePath: string;
  backupDir: string;
  musicbrainzUserAgent: string;
  musicbrainzUrl: string;
  coverArtArchiveUrl: string;
  deezerUrl: string;
};

const DEFAULT_DATABASE_PATH = "./data/album-ranker.db";
const DEFAULT_BACKUP_DIR = join("~", ".album-ranker", "backups");
const DEFAULT_MUSICBRAINZ_USER_AGENT = "album-ranker/0.1";
const DEFAULT_MUSICBRAINZ_URL = "https://musicbrainz.org";
const DEFAULT_COVER_ART_ARCHIVE_URL = "https://coverartarchive.org";
const DEFAULT_DEEZER_URL = "https://api.deezer.com";

/** Expands a leading `~` to the home directory. */
function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
}

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
    backupDir: expandHome(
      readSetting("BACKUP_DIR", DEFAULT_BACKUP_DIR, "Set it to a folder path, or unset it to use the default."),
    ),
    musicbrainzUserAgent: readSetting(
      "MUSICBRAINZ_USER_AGENT",
      DEFAULT_MUSICBRAINZ_USER_AGENT,
      "Set it to a User-Agent string, or unset it to use the default.",
    ),
    musicbrainzUrl: readSetting(
      "MUSICBRAINZ_URL",
      DEFAULT_MUSICBRAINZ_URL,
      "Set it to a base URL, or unset it to use the default.",
    ).trim().replace(/\/+$/, ""),
    coverArtArchiveUrl: readSetting(
      "COVER_ART_ARCHIVE_URL",
      DEFAULT_COVER_ART_ARCHIVE_URL,
      "Set it to a base URL, or unset it to use the default.",
    ).trim().replace(/\/+$/, ""),
    deezerUrl: readSetting(
      "DEEZER_URL",
      DEFAULT_DEEZER_URL,
      "Set it to a base URL, or unset it to use the default.",
    ).trim().replace(/\/+$/, ""),
  };
}
