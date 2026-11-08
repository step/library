# Database Issues

Findings from a review of the schema (`schema.sql`), the data-access code (`db/*.ts`) and the dump/restore tooling. Ordered by severity.

An issue is marked **DONE** only once its migration is written, committed under `drizzle/` and executed against `library-dev`. Run migrations with `npm run db:migrate`.

| # | Issue | Status |
|---|---|---|
| 1 | `borrowed_books.user_id` has no FK | **DONE** (`0003_borrowed_books_user_fk`) |
| 2 | Copy can be double-borrowed | **DONE** (`0001_one_open_loan_per_copy`) |
| 3 | Redundant state | **DONE** (`0004_sync_book_counts`, `0005_sync_copy_borrowed_flag`) |
| 4 | Missing constraints | **DONE** (`0002_not_null_and_checks`) |
| 5 | Two user systems | **DONE** (`0008_nextauth_integrity`) |
| 6 | Redundant indexes | **DONE** (`0006_drop_redundant_indexes`) |
| 7 | Minor items | **DONE** (`0007_timestamptz_and_text_titles`) |
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

**Status: DONE.** Migration `drizzle/0004_sync_book_counts.sql`, executed on `library-dev`.
- Trigger `trg_book_copies_sync_counts` on `book_copies` sets `books.count` to the number of copy rows and `books.borrowed_count` to the number flagged borrowed.
- `borrowBook`, `returnBook` and `addCopies` no longer update the counts by hand. This also fixes `addCopies` over-counting when `ON CONFLICT DO NOTHING` skips a copy.
- Data repair: cleared the stale `borrowed` flag on copies 319 and 324 (no open loan; Pruthvi returned 319 on 2025-12-22), then recomputed both counts for every book. 15 books had `count` above their copy rows, for example book 155 is now 0.
- Migration `drizzle/0005_sync_copy_borrowed_flag.sql`, executed on `library-dev`, adds trigger `trg_borrowed_books_sync_flag` on `borrowed_books`. `book_copies.borrowed` is now derived: a copy is borrowed exactly when it has an open loan. The two triggers chain, so a loan insert or return updates the flag and then both counts.
- `borrowBook`, `returnBook` and `forceReturnBook` (`src/app/manage/borrowed-books/action.ts`) only write `borrowed_books` now. `forceReturnBook` lost its unused `bookCopyId` parameter.

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

**Status: DONE.** Migration `drizzle/0008_nextauth_integrity.sql`, executed on `library-dev`.
- **Decision:** `library_users` is the app's identity (`borrowed_books.user_id` points at it). The NextAuth `users` table is only the sign-in record and stays linked to it by email.
- `users.email` is now unique (`users_email_key`), and so are `accounts (provider, providerAccountId)` and `sessions.sessionToken`, which NextAuth assumes. They replace `idx_users_email`, `idx_accounts_provider` and `idx_sessions_token`.
- `accounts.userId` and `sessions.userId` now have FKs to `users(id)` with `ON DELETE CASCADE`.
- Data cleanup: removed the two NextAuth users whose `library_users` row had been deleted (users 72 and 94, expired sessions only). No duplicate emails, tokens or provider accounts existed.
- `deleteLibraryUser` (`db/user.ts`) now removes the matching NextAuth user in the same statement, so deleting a library user cascades to their accounts and sessions and signs them out at once. If the library user has borrow history, the FK from issue 1 refuses the whole statement and nothing is deleted.
- Not changed: the email link is exact-match. Dev has no case mismatches.

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

**Status: DONE.** Migration `drizzle/0006_drop_redundant_indexes.sql`, executed on `library-dev`. Usage was checked on `library-prod` (read-only, stats never reset) and dev.
- Dropped the six exact duplicates of a `UNIQUE` index: `idx_library_users_email`, `idx_books_isbn10`, `idx_books_isbn13`, `idx_books_db_isbn10`, `idx_books_db_isbn13`, `idx_book_copies_qr_code`. Postgres splits scans between two identical indexes, so some of them showed prod scans. The unique index takes over.
- Dropped `idx_books_title`: 0 scans on prod and dev. No query orders by or matches `title` exactly, and search uses `ILIKE '%q%'`.
- Dropped `idx_book_copies_borrowed`: 0 scans on both.
- **Kept `idx_books_id_title`:** the doc called it redundant, but prod shows 7,349 scans. It serves the paginated search query (`WHERE id > ... AND title ILIKE ... ORDER BY id`).
- **Kept `idx_books_title_gin`:** 0 scans today because `books` has only 279 rows and a sequential scan is cheaper. It is the right index for `ILIKE` search if the catalog grows.
- Not touched, unused or redundant but outside this issue: `idx_sessions_expires`, `idx_sessions_user_id`, `idx_verification_token_expires`, and `idx_verification_token_identifier` (a prefix of the primary key).

### 7. Minor items

- `borrowed_at` and `created_at` are `TIMESTAMP` without time zone, while the NextAuth tables use `TIMESTAMPTZ`.
- `library_users.batch_id` is a bare integer with no `batches` table.
- `books.title` is capped at `VARCHAR(255)`.
- There is no migration tooling. `schema.sql` is a single `IF NOT EXISTS` script, so changes such as adding `batch_id NOT NULL` do not apply to an existing database. A small SQL migration runner (`scripts/migrate.mjs`) was prototyped but no migrations are committed.

**Status: DONE.** Migration `drizzle/0007_timestamptz_and_text_titles.sql`, executed on `library-dev`.
- `borrowed_at`, `returned_at` and `library_users.created_at` are now `TIMESTAMPTZ`. Existing values were UTC (Neon runs in GMT) and were converted explicitly with `AT TIME ZONE 'UTC'`, so the instants are unchanged. Side effect: the Neon driver parsed the old `TIMESTAMP` values in the Node server's time zone, so a server outside UTC showed borrow times shifted (5.5 hours on an IST machine). It now returns the right instant everywhere.
- `books.title` and `books_db.title` are `TEXT`. The longest existing title is 126 characters.
- Migration tooling: done, see issues 2 and 4.
- The migration drops and recreates `trg_borrowed_books_sync_flag`, because Postgres refuses to change the type of a column used in a trigger definition. `drizzle-kit migrate` swallowed that error and printed nothing, so check the result with a query, not the command output.
- `library_users.batch_id` stays a plain integer by decision: a `batches` table with an FK would reject new batch numbers in add-user and CSV import until someone created the batch. Dev has 8 distinct values (0, 5, 6, 7, 8, 10, 11, 12).

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
