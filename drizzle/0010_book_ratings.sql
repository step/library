CREATE TABLE "book_ratings" (
	"user_id" integer NOT NULL,
	"book_id" integer NOT NULL,
	"rating" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "book_ratings_pkey" PRIMARY KEY("user_id","book_id"),
	CONSTRAINT "book_ratings_rating_check" CHECK (rating BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "rating_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "rating_sum" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "book_ratings" ADD CONSTRAINT "book_ratings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."library_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_ratings" ADD CONSTRAINT "book_ratings_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_book_ratings_book_id" ON "book_ratings" USING btree ("book_id");--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_rating_totals_check" CHECK (rating_count >= 0 AND rating_sum BETWEEN rating_count AND 5 * rating_count);--> statement-breakpoint
-- books.rating_count and books.rating_sum hold the totals of book_ratings for each book.
-- Every change applies a delta with one UPDATE of the book row. That UPDATE locks the row, so
-- two readers rating the same book at the same time are applied one after the other and neither
-- change is lost (sync_book_counts recounts instead, which needed the explicit lock added in 0009).
CREATE OR REPLACE FUNCTION "sync_book_rating_totals"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."book_id" = NEW."book_id" THEN
    UPDATE "books" SET "rating_sum" = "rating_sum" - OLD."rating" + NEW."rating" WHERE "id" = NEW."book_id";
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- A rating moved to another book. Lock both books in id order so two moves in opposite
    -- directions cannot deadlock.
    PERFORM 1 FROM "books" WHERE "id" IN (OLD."book_id", NEW."book_id") ORDER BY "id" FOR NO KEY UPDATE;
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE "books" SET "rating_count" = "rating_count" - 1, "rating_sum" = "rating_sum" - OLD."rating"
    WHERE "id" = OLD."book_id";
  END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN
    UPDATE "books" SET "rating_count" = "rating_count" + 1, "rating_sum" = "rating_sum" + NEW."rating"
    WHERE "id" = NEW."book_id";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "trg_book_ratings_sync_totals"
AFTER INSERT OR DELETE OR UPDATE OF "rating", "book_id" ON "book_ratings"
FOR EACH ROW EXECUTE FUNCTION "sync_book_rating_totals"();
--> statement-breakpoint
-- TRUNCATE does not fire row triggers, so it would leave the totals behind. Reset them instead.
CREATE OR REPLACE FUNCTION "reset_book_rating_totals"() RETURNS trigger AS $$
BEGIN
  UPDATE "books" SET "rating_count" = 0, "rating_sum" = 0 WHERE "rating_count" <> 0 OR "rating_sum" <> 0;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "trg_book_ratings_truncate_totals"
AFTER TRUNCATE ON "book_ratings"
FOR EACH STATEMENT EXECUTE FUNCTION "reset_book_rating_totals"();
