-- Idempotent: safe to run on a database that already has the schema.
-- Existing objects are skipped, never altered. pg_trgm is required by the GIN trigram index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"providerAccountId" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" bigint,
	"id_token" text,
	"scope" text,
	"session_state" text,
	"token_type" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_copies" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_id" integer,
	"borrowed" boolean DEFAULT false,
	"qr_code" text,
	CONSTRAINT "book_copies_qr_code_key" UNIQUE("qr_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "books" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"authors" text NOT NULL,
	"isbn10" varchar(10),
	"isbn13" varchar(13),
	"count" integer DEFAULT 0,
	"borrowed_count" integer DEFAULT 0,
	CONSTRAINT "books_isbn10_key" UNIQUE("isbn10"),
	CONSTRAINT "books_isbn13_key" UNIQUE("isbn13")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "books_db" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"authors" text,
	"isbn10" varchar(10),
	"isbn13" varchar(13),
	CONSTRAINT "books_db_isbn10_key" UNIQUE("isbn10"),
	CONSTRAINT "books_db_isbn13_key" UNIQUE("isbn13")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "borrowed_books" (
	"id" serial PRIMARY KEY NOT NULL,
	"book_copy_id" integer,
	"user_id" integer NOT NULL,
	"borrowed_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"returned_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "library_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"is_admin" boolean DEFAULT false,
	"batch_id" integer NOT NULL,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "library_users_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"sessionToken" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"email" varchar(255),
	"emailVerified" timestamp with time zone,
	"image" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_token" (
	"identifier" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	CONSTRAINT "verification_token_pkey" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "borrowed_books" ADD CONSTRAINT "borrowed_books_book_copy_id_fkey" FOREIGN KEY ("book_copy_id") REFERENCES "public"."book_copies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_accounts_provider" ON "accounts" USING btree ("provider","providerAccountId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_accounts_user_id" ON "accounts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_book_copies_book_id" ON "book_copies" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_book_copies_borrowed" ON "book_copies" USING btree ("borrowed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_book_copies_qr_code" ON "book_copies" USING btree ("qr_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_id_title" ON "books" USING btree ("id","title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_isbn10" ON "books" USING btree ("isbn10");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_isbn13" ON "books" USING btree ("isbn13");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_title" ON "books" USING btree ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_title_gin" ON "books" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_db_isbn10" ON "books_db" USING btree ("isbn10");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_books_db_isbn13" ON "books_db" USING btree ("isbn13");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_borrowed_books_book_copy_id" ON "borrowed_books" USING btree ("book_copy_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_borrowed_books_user_borrowed" ON "borrowed_books" USING btree ("user_id","borrowed_at") WHERE (returned_at IS NULL);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_borrowed_books_user_id" ON "borrowed_books" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_library_users_email" ON "library_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_expires" ON "sessions" USING btree ("expires");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_token" ON "sessions" USING btree ("sessionToken");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_user_id" ON "sessions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_verification_token_expires" ON "verification_token" USING btree ("expires");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_verification_token_identifier" ON "verification_token" USING btree ("identifier");