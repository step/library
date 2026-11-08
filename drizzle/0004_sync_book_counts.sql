-- Issue 3: redundant state.
-- books.count and books.borrowed_count are now maintained by a trigger on book_copies:
--   count          = number of book_copies rows for the book
--   borrowed_count = number of those copies flagged borrowed
-- 1) Data fix: a copy flagged borrowed with no open loan is stale (e.g. copy 319 was returned
--    on 2025-12-22 but never unflagged; copy 324 has no open loan either).
UPDATE "book_copies" c
SET "borrowed" = FALSE
WHERE c."borrowed"
  AND NOT EXISTS (
    SELECT 1 FROM "borrowed_books" b WHERE b."book_copy_id" = c."id" AND b."returned_at" IS NULL
  );
--> statement-breakpoint
-- 2) Data fix: recompute the counts from the copies.
UPDATE "books" b
SET "count" = (SELECT COUNT(*) FROM "book_copies" c WHERE c."book_id" = b."id"),
    "borrowed_count" = (SELECT COUNT(*) FROM "book_copies" c WHERE c."book_id" = b."id" AND c."borrowed");
--> statement-breakpoint
-- 3) Trigger that keeps the counts in sync from now on.
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

  UPDATE "books" b
  SET "count" = (SELECT COUNT(*) FROM "book_copies" c WHERE c."book_id" = b."id"),
      "borrowed_count" = (SELECT COUNT(*) FROM "book_copies" c WHERE c."book_id" = b."id" AND c."borrowed")
  WHERE b."id" = ANY (ids);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "trg_book_copies_sync_counts"
AFTER INSERT OR DELETE OR UPDATE OF "borrowed", "book_id" ON "book_copies"
FOR EACH ROW EXECUTE FUNCTION "sync_book_counts"();
