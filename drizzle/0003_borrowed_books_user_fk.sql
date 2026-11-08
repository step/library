-- Issue 1: borrowed_books.user_id must reference library_users(id).
-- Fails (safely) if orphaned rows exist; none found on dev or prod as of 2026-11-09.
ALTER TABLE "borrowed_books" ADD CONSTRAINT "borrowed_books_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."library_users"("id") ON DELETE restrict ON UPDATE no action;