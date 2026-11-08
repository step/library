-- Issue 4: missing constraints.
-- 1) Data fix: borrowed_count must not exceed count. Reset it to the number of copies
--    actually flagged borrowed (dev: book 184 had borrowed_count 2 with 1 copy).
UPDATE "books" b
SET "borrowed_count" = (SELECT COUNT(*) FROM "book_copies" c WHERE c."book_id" = b."id" AND c."borrowed")
WHERE b."borrowed_count" > b."count" OR b."borrowed_count" < 0;
--> statement-breakpoint
-- 2) Constraints.
ALTER TABLE "book_copies" ALTER COLUMN "book_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "book_copies" ALTER COLUMN "borrowed" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "book_copies" ALTER COLUMN "qr_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ALTER COLUMN "count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ALTER COLUMN "borrowed_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "borrowed_books" ALTER COLUMN "book_copy_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_counts_check" CHECK (borrowed_count >= 0 AND borrowed_count <= count);--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_has_isbn_check" CHECK (isbn10 IS NOT NULL OR isbn13 IS NOT NULL);