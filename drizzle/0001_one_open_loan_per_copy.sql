-- Issue 2: a copy could be double-borrowed (concurrent borrows both passed the check).
-- 1) Data fix: where a copy has several open loans, keep the newest and close the
--    older duplicates as zero-length loans (returned_at = borrowed_at). Nothing is deleted.
UPDATE "borrowed_books" bb
SET "returned_at" = bb."borrowed_at"
WHERE bb."returned_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "borrowed_books" newer
    WHERE newer."book_copy_id" = bb."book_copy_id"
      AND newer."returned_at" IS NULL
      AND (newer."borrowed_at", newer."id") > (bb."borrowed_at", bb."id")
  );
--> statement-breakpoint
-- 2) Guard: at most one open loan per copy.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_borrowed_books_open_copy" ON "borrowed_books" USING btree ("book_copy_id") WHERE (returned_at IS NULL);
