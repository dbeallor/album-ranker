import { homedir } from "node:os";
import { join } from "node:path";

export type DeployEnv = "staging" | "production";

/** What the password gate reads. `deployEnv` is set only on a deployed environment; with it set, the gate is always on. */
export type GateConfig = {
  deployEnv: DeployEnv | null;
  /** `APP_PASSWORD`; null when unset or empty. Not length-checked here: see `gatePasswordProblem`. */
  appPassword: string | null;
  /** `ORIGIN_SECRET`: the value CloudFront sends in `x-origin-secret`; null when unset or empty. */
  originSecret: string | null;
};

export type Config = GateConfig & {
  databasePath: string;
  /** Set when the database lives in S3 (`DATABASE_S3_BUCKET` and `DATABASE_S3_KEY`); `databasePath` is then the working copy in `/tmp`. */
  databaseS3: { bucket: string; key: string } | null;
  backupDir: string;
  musicbrainzUserAgent: string;
  musicbrainzUrl: string;
  coverArtArchiveUrl: string;
  deezerUrl: string;
};

export const MIN_PASSWORD_LENGTH = 12;

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

function readOptional(name: string): string | null {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? null : raw;
}

/** Reads the gate settings without judging the password, so the proxy can answer 503 instead of crashing. */
export function readGateConfig(): GateConfig {
  const raw = process.env.DEPLOY_ENV;
  if (raw !== undefined && raw !== "staging" && raw !== "production") {
    throw new Error(`DEPLOY_ENV is "${raw}". Set it to staging or production, or unset it for a local run.`);
  }
  return { deployEnv: raw ?? null, appPassword: readOptional("APP_PASSWORD"), originSecret: readOptional("ORIGIN_SECRET") };
}

/** Why a deployed environment can't run with this password, or null when it can (or no gate is expected). */
export function gatePasswordProblem(gate: GateConfig): string | null {
  if (gate.deployEnv === null) return null;
  if (gate.appPassword === null) {
    return `APP_PASSWORD is not set. A ${gate.deployEnv} environment needs a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (gate.appPassword.length < MIN_PASSWORD_LENGTH) {
    return `APP_PASSWORD is shorter than ${MIN_PASSWORD_LENGTH} characters. A ${gate.deployEnv} environment needs a longer one.`;
  }
  return null;
}

/** The S3 object the database syncs with: both settings, or neither. */
export function readDatabaseS3(): { bucket: string; key: string } | null {
  const bucket = readOptional("DATABASE_S3_BUCKET");
  const key = readOptional("DATABASE_S3_KEY");
  if (bucket === null && key === null) return null;
  if (bucket === null || key === null) {
    throw new Error("DATABASE_S3_BUCKET and DATABASE_S3_KEY must be set together. Set both for S3 storage, or neither for a local file.");
  }
  return { bucket, key };
}

/** Only the local database and backup folder settings, for scripts that need no password gate, S3 or catalog settings. */
export function getDataPaths(): { databasePath: string; backupDir: string } {
  return {
    databasePath: readSetting("DATABASE_PATH", DEFAULT_DATABASE_PATH, "Set it to a file path, or unset it to use the default."),
    backupDir: expandHome(
      readSetting("BACKUP_DIR", DEFAULT_BACKUP_DIR, "Set it to a folder path, or unset it to use the default."),
    ),
  };
}

export function getConfig(): Config {
  const gate = readGateConfig();
  const problem = gatePasswordProblem(gate);
  if (problem) throw new Error(problem);
  return {
    ...gate,
    ...getDataPaths(),
    databaseS3: readDatabaseS3(),
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
