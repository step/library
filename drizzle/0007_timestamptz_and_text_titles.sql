-- Issue 7: minor items.
-- 1) books.title and books_db.title lose the arbitrary 255 limit (varchar -> text).
-- 2) borrowed_at, returned_at and created_at become timestamptz, like the NextAuth tables.
--    The old values were written by CURRENT_TIMESTAMP on a server running in UTC (the Neon
--    timezone is GMT), so they are converted explicitly as UTC rather than via the session zone.
ALTER TABLE "books" ALTER COLUMN "title" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "books_db" ALTER COLUMN "title" SET DATA TYPE text;--> statement-breakpoint
-- trg_borrowed_books_sync_flag fires on UPDATE OF "returned_at", and Postgres refuses to change the
-- type of a column used in a trigger definition, so drop it here and recreate it below.
DROP TRIGGER "trg_borrowed_books_sync_flag" ON "borrowed_books";--> statement-breakpoint
ALTER TABLE "borrowed_books" ALTER COLUMN "borrowed_at" SET DATA TYPE timestamp with time zone USING "borrowed_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "borrowed_books" ALTER COLUMN "borrowed_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "borrowed_books" ALTER COLUMN "returned_at" SET DATA TYPE timestamp with time zone USING "returned_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "library_users" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone USING "created_at" AT TIME ZONE 'UTC';--> statement-breakpoint
ALTER TABLE "library_users" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;
--> statement-breakpoint
CREATE TRIGGER "trg_borrowed_books_sync_flag"
AFTER INSERT OR DELETE OR UPDATE OF "returned_at", "book_copy_id" ON "borrowed_books"
FOR EACH ROW EXECUTE FUNCTION "sync_copy_borrowed_flag"();
