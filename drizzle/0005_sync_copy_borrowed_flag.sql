-- Issue 3 (follow-up): book_copies.borrowed is now derived from borrowed_books.
-- A copy is borrowed exactly when it has an open loan (returned_at IS NULL).
-- Together with trg_book_copies_sync_counts this keeps the counts on books correct as well.
-- 1) Data fix (idempotent): align the flag with the open loans in both directions.
UPDATE "book_copies" c
SET "borrowed" = EXISTS (
  SELECT 1 FROM "borrowed_books" b WHERE b."book_copy_id" = c."id" AND b."returned_at" IS NULL
)
WHERE c."borrowed" IS DISTINCT FROM EXISTS (
  SELECT 1 FROM "borrowed_books" b WHERE b."book_copy_id" = c."id" AND b."returned_at" IS NULL
);
--> statement-breakpoint
-- 2) Trigger on borrowed_books.
CREATE OR REPLACE FUNCTION "sync_copy_borrowed_flag"() RETURNS trigger AS $$
DECLARE
  ids integer[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    ids := ARRAY[NEW."book_copy_id"];
  ELSIF TG_OP = 'DELETE' THEN
    ids := ARRAY[OLD."book_copy_id"];
  ELSE
    ids := ARRAY[OLD."book_copy_id", NEW."book_copy_id"];
  END IF;

  UPDATE "book_copies" c
  SET "borrowed" = EXISTS (
    SELECT 1 FROM "borrowed_books" b WHERE b."book_copy_id" = c."id" AND b."returned_at" IS NULL
  )
  WHERE c."id" = ANY (ids);

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "trg_borrowed_books_sync_flag"
AFTER INSERT OR DELETE OR UPDATE OF "returned_at", "book_copy_id" ON "borrowed_books"
FOR EACH ROW EXECUTE FUNCTION "sync_copy_borrowed_flag"();
