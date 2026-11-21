ALTER TABLE year_entries
  ADD COLUMN source_decade_rank INTEGER
  CHECK (source_decade_rank IS NULL OR source_decade_rank BETWEEN 1 AND 25);

ALTER TABLE import_review_items
  ADD COLUMN reason TEXT NOT NULL DEFAULT 'no_match'
  CHECK (reason IN ('no_match', 'ambiguous', 'duplicate_album', 'rank_taken'));

ALTER TABLE import_review_items
  ADD COLUMN reason_detail TEXT;
