export type Config = {
  databasePath: string;
};

const DEFAULT_DATABASE_PATH = "./data/album-ranker.db";

export function getConfig(): Config {
  const raw = process.env.DATABASE_PATH;

  if (raw === undefined) {
    return { databasePath: DEFAULT_DATABASE_PATH };
  }
  if (raw.trim() === "") {
    throw new Error(
      "DATABASE_PATH is set but empty. Set it to a file path, or unset it to use the default.",
    );
  }
  return { databasePath: raw };
}
