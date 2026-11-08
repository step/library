# Database Issues

Findings from a review of the schema (`schema.sql`), the data-access code (`db/*.ts`) and the dump/restore tooling. Ordered by severity.

An issue is marked **DONE** only once its migration is written, committed under `drizzle/` and executed against `library-dev`. Run migrations with `npm run db:migrate`.

| # | Issue | Status |
|---|---|---|
| 1 | `borrowed_books.user_id` has no FK | **DONE** (`0003_borrowed_books_user_fk`) |
| 2 | Copy can be double-borrowed | **DONE** (`0001_one_open_loan_per_copy`) |
| 3 | Redundant state | open |
| 4 | Missing constraints | **DONE** (`0002_not_null_and_checks`) |
| 5 | Two user systems | open |
| 6 | Redundant indexes | open |
| 7 | Minor items | open |
| 8 | `db-restore.sh` pooler | **DONE** |
| 9 | Dev holds prod data | open |
| 10 | Credentials exposed | open |

## Schema issues

### 1. `borrowed_books.user_id` has no foreign key

`user_id` is meant to reference `library_users(id)`, but nothing enforces it.

- `deleteLibraryUser` (`db/user.ts`) is a bare `DELETE FROM library_users`. Deleting a user who has borrowed books leaves orphaned history. Open rows (`returned_at IS NULL`) leave copies stuck as `borrowed` with no valid borrower.
- Production data may already contain orphans, so any FK migration must check for them first.

**Fix:** add `FOREIGN KEY (user_id) REFERENCES library_users(id) ON DELETE RESTRICT` (or soft-delete users and block deletion while they hold books). The API route `DELETE /api/users/[id]` should map the resulting FK violation (Postgres code `23503`) to a 409 instead of a 500.

**Status: DONE.** Migration `drizzle/0003_borrowed_books_user_fk.sql`, executed on `library-dev`.
- Adds `borrowed_books_user_id_fkey` with `ON DELETE RESTRICT`.
- No orphaned or NULL `user_id` rows on dev or prod (checked 2026-11-09).
- `DELETE /api/users/[id]` now returns 409 on Postgres error `23503`.
- Prod does not yet have migrations 0001 and 0002, so apply all of 0001 to 0003 in order there.

### 2. A copy can be double-borrowed

`borrowBook` (`db/borrowedBooks.ts`) reads `book_copies.borrowed` with a plain `SELECT` inside the transaction, with no `FOR UPDATE`, and the schema has no guard. Two concurrent borrows of the same QR code can both pass the check and both insert a row.

**Fix:**
- Lock the copy row: `SELECT ... FROM book_copies WHERE qr_code = $1 FOR UPDATE`.
- Add a guard in the schema: `CREATE UNIQUE INDEX ON borrowed_books (book_copy_id) WHERE returned_at IS NULL`.

The same applies to `returnBook`, which should lock the copy row too.

**Status: DONE.** Migration `drizzle/0001_one_open_loan_per_copy.sql`, executed on `library-dev`.
- `borrowBook` and `returnBook` now lock the copy row with `FOR UPDATE`.
- Migration adds the partial unique index `uq_borrowed_books_open_copy`.
- It first closed older duplicate open loans (kept the newest per copy; closed ones get `returned_at = borrowed_at`). On dev this affected `borrowed_books` rows 216 (copy 20) and 299 (copy 212).
- Found while checking: copies 319 and 324 are flagged `borrowed` but have no open loan. Left for issue 3.

### 3. State is stored redundantly

Whether a copy is borrowed is recorded in three places:

- `book_copies.borrowed`
- an open row in `borrowed_books`
- `books.borrowed_count`

`books.count` likewise duplicates the number of `book_copies` rows. Only application code keeps these in sync, so a partial failure or manual edit makes them drift.

**Fix:** derive the counts (`COUNT(*) FILTER (WHERE ...)`), or keep them and add a trigger plus `CHECK (borrowed_count BETWEEN 0 AND count)`.

### 4. Missing constraints

- `book_copies.book_id` and `borrowed_books.book_copy_id` are nullable, so rows can be orphaned.
- `book_copies.qr_code` is nullable.
- `books.count` and `books.borrowed_count` are nullable and can go negative.
- `books.isbn10` and `books.isbn13` can both be NULL.

**Fix:** add `NOT NULL` and `CHECK` constraints. Check existing data for violations first.

**Status: DONE.** Migration `drizzle/0002_not_null_and_checks.sql`, executed on `library-dev`.
- `NOT NULL` added to `book_copies.book_id`, `book_copies.borrowed`, `book_copies.qr_code`, `books.count`, `books.borrowed_count` and `borrowed_books.book_copy_id`.
- `CHECK books_counts_check`: `borrowed_count >= 0 AND borrowed_count <= count`.
- `CHECK books_has_isbn_check`: `isbn10` or `isbn13` must be set.
- The only violating row on dev was book 184 (`borrowed_count` 2, `count` 1). The migration resets it to the number of copies flagged borrowed.
- **Run the same violation checks against production before applying there.**
- Found while checking: 19 books have `count` different from their number of `book_copies` rows. `addCopies` (`db/books.ts`) adds `copies.length` to `count` even when `ON CONFLICT DO NOTHING` skips a copy. Left for issue 3, so no `count = copies` check was added.

### 5. Two user systems

`users` (NextAuth) and `library_users` are linked only by email, and `borrowed_books` points at an unspecified one.

- The NextAuth tables have no primary keys beyond `id`, no FKs on `"userId"`, and `users.email` is not unique.
- `sessions` and `accounts` rows are not cleaned up when a user is removed.

**Fix:** decide on one canonical user key, add FKs with `ON DELETE CASCADE` on `accounts` and `sessions`, and make `users.email` unique.

### 6. Redundant indexes

Each of these duplicates an index that a `UNIQUE` constraint already creates:

- `idx_library_users_email`
- `idx_books_isbn10`
- `idx_books_isbn13`
- `idx_books_db_isbn10`
- `idx_books_db_isbn13`
- `idx_book_copies_qr_code`

Also:

- `idx_books_id_title` is mostly redundant, since `id` is already the primary key.
- `idx_books_title` (btree) overlaps with the GIN trigram index `idx_books_title_gin`.
- `idx_book_copies_borrowed` is a low-selectivity boolean index and is unlikely to be used.

**Fix:** drop the redundant indexes after confirming with `pg_stat_user_indexes` that they are unused.

### 7. Minor items

- `borrowed_at` and `created_at` are `TIMESTAMP` without time zone, while the NextAuth tables use `TIMESTAMPTZ`.
- `library_users.batch_id` is a bare integer with no `batches` table.
- `books.title` is capped at `VARCHAR(255)`.
- There is no migration tooling. `schema.sql` is a single `IF NOT EXISTS` script, so changes such as adding `batch_id NOT NULL` do not apply to an existing database. A small SQL migration runner (`scripts/migrate.mjs`) was prototyped but no migrations are committed.

## Operational issues

### 8. `db-restore.sh` breaks pooled connections

Plain SQL dumps begin with `SELECT pg_catalog.set_config('search_path', '', false)`. Restoring a `.sql` dump through a Neon `-pooler` URL leaves `search_path` empty on the pooler's server connections, because the pooler does not reset session state between clients. The app then fails with `relation "users" does not exist` even though the tables exist.

- Symptom: NextAuth error `adapter_error_getuserbyaccount`.
- Recovery: restart the Neon compute (this clears the pooled connections).
- **Status: DONE.** `scripts/db-restore.sh` now strips `-pooler` from the target host and connects directly, printing a note when it does. The script was recovered from a git stash, because it had never been committed. `scripts/dumps/` is gitignored, since dumps contain real emails and tokens.

### 9. `library-dev` holds production data

The dev database was populated from a production dump, so `sessions` and `accounts` contain live session and OAuth tokens, and `library_users` and `users` contain real emails.

**Plan changed:** `library-dev` will become the production database. The prod app will be pointed at it once everything is fixed and verified, so migrations 0001 onwards are not applied to prod separately. Do **not** clear `sessions` and `accounts`, and keep the same `NEXTAUTH_SECRET`, or every user is signed out.

**Before cutover:** dev is only a copy of prod from some earlier point, and prod keeps taking borrows and returns. Re-sync first: take a fresh dump of prod, restore it into the target database with `scripts/db-restore.sh`, then replay the migrations. Switching to the current `library-dev` unchanged would lose recent prod data. A diff on 2026-11-09 already showed `borrowed_books` row 299 missing from dev.

### 10. Credentials exposed in chat

The dev database password was pasted into a working session several times. Because dev will become prod, rotate it in the Neon console before cutover.

## What is already good

- The borrow and return flow uses transactions.
- The partial index `idx_borrowed_books_user_borrowed` fits the "my current books" query.
- The GIN trigram index suits fuzzy title search.
- Cascade deletes from `books` to `book_copies` to `borrowed_books` are consistent, although they also erase borrow history when a book is deleted.

## Suggested order of work

1. Issues 2 and 4 (correctness under concurrency, and constraints).
2. Issue 1 (after checking production for orphaned rows).
3. Reintroduce migration tooling, so the fixes above ship as versioned migrations.
4. Issue 8 (a one-line change to the restore script).
5. Issues 3, 5, 6 and 7 as time allows.
