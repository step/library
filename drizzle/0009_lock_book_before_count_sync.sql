-- Fix a lost update in books.count / books.borrowed_count.
-- sync_book_counts recomputed the counts from the statement snapshot, so two transactions that
-- changed different copies of the same book at the same time each wrote a count that did not
-- include the other's uncommitted change, and the last commit won (6 parallel borrows of 6
-- copies left borrowed_count = 1). Locking the book row first makes the second transaction wait
-- until the first has committed, and its recount (a new statement, so a new snapshot) sees it.
CREATE OR REPLACE FUNCTION "sync_book_counts"() RETURNS trigger AS $$
DECLARE
  ids integer[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    ids := ARRAY[NEW."book_id"];
  ELSIF TG_OP = 'DELETE' THEN
    ids := ARRAY[OLD."book_id"];
  ELSE
    ids := ARRAY[OLD."book_id", NEW."book_id"];
  END IF;
  -- Fixed lock order (by id) so two moves in opposite directions cannot deadlock. NO KEY UPDATE is the
  -- mode the UPDATE below takes anyway; unlike FOR UPDATE it does not conflict with the KEY SHARE lock
  -- that concurrent inserts into book_copies hold on the book through the foreign key (that deadlocked).
  PERFORM 1 FROM "books" WHERE "id" = ANY (ids) ORDER BY "id" FOR NO KEY UPDATE;
  UPDATE "books" b
  SET "count" = (SELECT COUNT(*) FROM "book_copies" c WHERE c."book_id" = b."id"),
      "borrowed_count" = (SELECT COUNT(*) FROM "book_copies" c WHERE c."book_id" = b."id" AND c."borrowed")
  WHERE b."id" = ANY (ids);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
