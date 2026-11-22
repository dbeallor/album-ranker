CREATE TABLE library_albums (
  album_id INTEGER PRIMARY KEY REFERENCES albums (id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year BETWEEN 1900 AND 2100),
  added_at TEXT NOT NULL,
  source_title TEXT,
  source_artist TEXT,
  source_year INTEGER,
  UNIQUE (source_title, source_artist, source_year),
  CHECK (
    (source_title IS NULL AND source_artist IS NULL AND source_year IS NULL)
    OR (source_title IS NOT NULL AND source_artist IS NOT NULL AND source_year IS NOT NULL)
  )
);

CREATE INDEX library_albums_year ON library_albums (year);

INSERT INTO library_albums (album_id, year, added_at, source_title, source_artist, source_year)
  SELECT album_id, year, created_at, source_title, source_artist, source_year FROM year_entries;

DROP TABLE decade_list_entries;
DROP TABLE year_entries;
