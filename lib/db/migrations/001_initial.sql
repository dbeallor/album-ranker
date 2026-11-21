CREATE TABLE artists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  catalog_id TEXT UNIQUE
);

CREATE TABLE albums (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL CHECK (trim(title) <> ''),
  artist_id INTEGER NOT NULL REFERENCES artists (id),
  catalog_id TEXT UNIQUE,
  release_year INTEGER,
  cover_url TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX albums_artist_id ON albums (artist_id);

CREATE TABLE year_entries (
  id INTEGER PRIMARY KEY,
  album_id INTEGER NOT NULL UNIQUE REFERENCES albums (id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2100),
  placement TEXT NOT NULL CHECK (placement IN ('ranked', 'honorable_mention', 'listed')),
  rank INTEGER,
  source_title TEXT,
  source_artist TEXT,
  source_year INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (year, rank),
  UNIQUE (source_title, source_artist, source_year),
  CHECK (
    (placement = 'ranked' AND rank BETWEEN 1 AND 10)
    OR (placement <> 'ranked' AND rank IS NULL)
  ),
  CHECK (
    (source_title IS NULL AND source_artist IS NULL AND source_year IS NULL)
    OR (source_title IS NOT NULL AND source_artist IS NOT NULL AND source_year IS NOT NULL)
  )
);

CREATE TABLE matchups (
  id INTEGER PRIMARY KEY,
  album_a_id INTEGER NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
  album_b_id INTEGER NOT NULL REFERENCES albums (id) ON DELETE CASCADE,
  result TEXT NOT NULL CHECK (result IN ('a', 'b', 'tie')),
  created_at TEXT NOT NULL,
  CHECK (album_a_id <> album_b_id)
);

CREATE INDEX matchups_replay_order ON matchups (created_at, id);
CREATE INDEX matchups_album_a_id ON matchups (album_a_id);
CREATE INDEX matchups_album_b_id ON matchups (album_b_id);

CREATE TABLE decade_list_entries (
  id INTEGER PRIMARY KEY,
  decade INTEGER NOT NULL CHECK (decade BETWEEN 1900 AND 2100 AND decade % 10 = 0),
  album_id INTEGER NOT NULL UNIQUE REFERENCES albums (id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 25),
  UNIQUE (decade, position)
);

CREATE TABLE import_review_items (
  id INTEGER PRIMARY KEY,
  source_title TEXT NOT NULL,
  source_artist TEXT NOT NULL,
  source_year INTEGER NOT NULL,
  source_placement TEXT NOT NULL CHECK (source_placement IN ('ranked', 'honorable_mention', 'listed')),
  source_rank INTEGER,
  source_decade_rank INTEGER,
  candidates TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'skipped')),
  resolved_album_id INTEGER REFERENCES albums (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source_title, source_artist, source_year),
  CHECK (
    (source_placement = 'ranked' AND source_rank BETWEEN 1 AND 10)
    OR (source_placement <> 'ranked' AND source_rank IS NULL)
  )
);
