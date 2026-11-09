# Testing plan

Status legend: `[x]` done, `[ ]` to do. Priority: **P0** money/data/security, **P1** core user flows, **P2** everything else.

Only `components/Login.tsx` is tested today (`components/__tests__/Login.test.tsx`, 10 tests).
The app is about 4,600 lines across 75 source files. This plan covers all of it.

## 0. Findings from reading the code (turn each into a test first)

These look like real defects. Write a failing test that pins the intended behaviour, fix it, keep the test.

| # | Where | Problem | Test that exposes it |
|---|---|---|---|
| F1 ✅ fixed | `src/app/api/reading/return/route.ts:29` | `if (!result)` is always false because `returnBook` returns an object `{success,message}`. A failed return (not borrowed, not found, DB error) answers **200 "Book returned successfully"**. | `returnBook` resolves `{success:false}` -> expect 400. |
| F2 ✅ fixed | no `src/middleware.ts` | `CLAUDE.md` says middleware protects all routes. It does not exist. `GET /api/book` (ISBN lookup, calls Google and Open Library) has no auth, and `/login` redirect relies only on the layout. | Request `/api/book?barcode=x` with no session -> expect 401. |
| F3 ✅ fixed | `src/app/lib/auth.ts:31` | `session` callback calls `checkIsUserAdmin(user.email)` before the `if (user)` guard. | Call with `user` undefined -> must not throw. |
| F4 | `hooks/useBookSearch.ts:57` | `data.length >= 0` is always true, so the condition does nothing. A search that returns `[]` is cached and shown, which is probably intended, but the expression is misleading. | Empty result is shown and cached. Pins intent. |
| F5 | `hooks/useBookSearch.ts:90` | Effect depends on `[debouncedSearchQuery, performSearch]` but `performSearch` changes whenever `searchCache` changes, so every cache write re-runs the search effect. Possible duplicate fetch or loop. | Count `loadBooksAfter` calls for one query: expect exactly 1. |
| F6 | `db/borrowedBooks.ts` `returnBook` | Returns the most recent borrow row for the copy and user even if it is already returned (`COALESCE` keeps old date, `RETURNING id` still yields a row). Relies on the `borrowed` flag check only. | DB test: double return -> second must fail. |
| F7 | `manage/borrowed-books/action.ts` `forceReturnBook` | No check that the UPDATE touched a row. A non-existent id returns success. | DB test with id 999999 -> expect `success:false`. |
| F8 ✅ fixed | `api/books/on-board/route.ts` | No validation of `title`, `authors`, ISBNs or `copies`. `copies` undefined makes `for..of` throw -> 500. Both ISBNs missing runs `WHERE isbn13 = undefined`. | Missing/invalid body -> expect 400. |
| F9 | `db/books.ts` `getBooks*`, `action.ts` | `ILIKE '%'+q+'%'` does not escape `%` and `_`, so searching `100%` or `_` matches everything. `parseInt(lastSeenId)` of garbage is `NaN`. | Search `%` returns only titles containing a literal `%`. |
| F10 | `api/books/route.ts` | `decodeURIComponent` on an already decoded value throws `URIError` on a stray `%` (for example `100%`), giving 500. `size=10abc` parses as 10. | `?search=100%25` and `?search=%E0%A4%A` -> expect 200 / 400, not 500. |
| F11 | `api/users/route.ts` POST | Duplicate detection matches the error text `'unique'`. Postgres code is `23505`. Also email is not validated. | Duplicate email -> 409 using a real PG error object. |
| F12 | `api/users/bulk/route.ts` | Check `!u.name` passes numbers, then `.trim()` throws on non-strings (500). Duplicates inside the same upload are inserted once, then skipped, but reported differently. Insert loop is not transactional. | Body `[{name:1,email:2,batchId:1}]` -> expect 400. |
| F13 | `db/user.ts` `deleteLibraryUser` | Deletes the NextAuth `users` row by email even though the library user delete may be rejected (FK). It is one statement so atomic, but a deleted admin can still hold a live session cookie until the cascade runs. | DB test with and without borrow history. |
| F14 | `components/Scanner.tsx` | `onError` and `onResult` both call `toggleShowScanner()`. If the scanner is already closed this reopens it. | Fire `onResult` twice quickly -> scanner must end closed. |
| F15 | `UsersManager.parseCSV` | Splits on `,` so quoted names (`"Smith, Jo"`), `\r\n` line endings leave a trailing `\r` on the last column, header row is silently skipped as invalid, and BOM is kept in the first name. | CSV tests in section 4. |
| F16 | `utils/dateUtils.formatBorrowDate` | Dead code: nothing imports it (checked with grep). It duplicates `formatTimeSince` with different rounding. Delete it rather than test it. | Delete the function; mutation score then ignores it. |
| F17 | `src/app/api/book/books-archeive.ts` | `findBook` runs Google and Open Library in parallel, but if either `fetch` rejects or returns non-JSON the whole lookup throws and the working one is discarded. `data.items[0]` is read when `totalItems` is missing. | One API fails, other succeeds -> expect book returned. |
| F19 ✅ fixed | `src/app/api/reading/route.ts` | Used `session.user.id`, but the session callback never sets an id, so the query ran with `undefined` and `GET /api/reading` returned nothing. Now uses `getLoggedInUser()`. | Matrix test: member id reaches `getBorrowedBooks`. |
| F18 | `manage/layout.tsx` | Redirects, but the nested pages (`users/page.tsx` and others) fetch before the layout runs in some cases (layouts and pages render in parallel). The data functions must enforce admin themselves. `getAllLibraryUsers` and `getAllBorrowedBooks` partly do. | Page-level test as non-admin: no data fetched. |

## 1. Test infrastructure (do first)

- [x] Vitest + jsdom + Testing Library (installed).
- [x] `vitest.config.mts`: add `resolve.alias` for `@/components`, `@/styles`, `@/types`, `@/utils`, `@/app` (copy from `tsconfig.json` `paths`). Right now only relative imports work.
- [ ] Split projects: `unit` (jsdom, mocks), `node` (route handlers, db) and `integration` (real Postgres). Use `test.projects` or `// @vitest-environment node` per file.
- [~] `test/helpers/` (done: `request.ts`, `identity.ts`; still to do: `mockSql`, `mockPool`, `factories`, `mockFetch`):
  - `mockSession.ts`: `mockSession({ email, isAdmin })` stubbing `getServerSession` and `getLoggedInUser`.
  - `mockSql.ts`: fake `neon()` tagged template that records queries and returns queued rows.
  - `mockPool.ts`: fake `pool.connect()` returning a client with scripted `query()` results and a call log (for BEGIN/COMMIT/ROLLBACK assertions).
  - `request.ts`: `makeRequest(url, { method, body, headers })` returning a `NextRequest`.
  - `factories.ts`: `book()`, `borrowedBook()`, `libraryUser()`.
  - `mockFetch.ts`: stubs global `fetch` per URL. **Nothing in the suite may reach the network.** (Done: `vitest.setup.ts` makes unmocked `fetch` throw.)
- [ ] Global mocks in `vitest.setup.ts`: `next/navigation` (`useRouter`, `usePathname`, `redirect` that throws), `next/font/google`, `next/dynamic` (render the component synchronously), `next/cache` (`revalidatePath`, `revalidateTag`, `unstable_cache` as passthrough), `next-auth/react`.
- [ ] Integration DB: use the compose Postgres (`postgres:18`) on a separate database `library_test`, created and migrated in a `globalSetup` (`drizzle-kit migrate`, then truncate between tests inside a transaction or with `TRUNCATE ... RESTART IDENTITY CASCADE`). Never read `.env`. Guard: abort if `DATABASE_URL` host is not `localhost` / `db.localtest.me`.
- [ ] Scripts: `test`, `test:watch`, `test:coverage`, `test:integration`, `test:mutation`, `test:e2e`.
- [ ] Coverage via `@vitest/coverage-v8`. Thresholds (fail CI below): lines 90, branches 85 for `db/`, `src/app/api/`, `hooks/`, `utils/`. 80 for `components/`.
- [ ] CI workflow (GitHub Actions): typecheck, lint, unit, integration (services: postgres:18), build, then e2e on main only. Mutation job nightly.

## 2. Pure logic (unit, no mocks) - P1

### `utils/dateUtils.ts`
Freeze time with `vi.useFakeTimers()` and `vi.setSystemTime`.
- [ ] `formatShortDate`: normal date; first/last day of month; leap day; ISO with offset; invalid string (`"Invalid Date"` - decide and pin); time zone near midnight (run under `TZ=UTC` and `TZ=Asia/Kolkata`).
- [ ] `formatTimeSince`: 0 min -> `Today`; 23h59m -> `Today`; exactly 24h -> `1 day ago`; 2 days; 29 days; **30 days -> `1 month ago`** (boundary); 59 and 60 days (`1 month` vs `2 months`); 364 and 365 days (`12 months` vs `1 year`); 365 + 29 days (no months suffix) vs 365 + 30 (`1 year 1 month`); 800 days; future date (negative days -> `Today`, pin it); invalid date.
- [ ] `formatDuration`: same instant, 23h, 24h, 29d, 30d, 364d, 365d, 730d, 395d, `to` before `from` (negative -> `Same day`), invalid dates.
- [ ] Pluralisation: `1 day` vs `2 days`, `1 month`, `1 year`.
- [ ] `formatBorrowDate`: delete (F16).

### `utils/useSnackbar.ts` (`renderHook`)
- [ ] Initial state closed, empty message, type success.
- [ ] `showSuccess` / `showError` set message + type + open.
- [ ] `close` keeps message and type but sets `isOpen:false`.
- [ ] Callbacks are referentially stable across renders.
- [ ] Error then success replaces type; repeated same message re-opens after close.

### `hooks/useDebounce.ts`
- [ ] Returns the initial value immediately.
- [ ] Updates only after `delay` (299 ms no, 300 ms yes).
- [ ] Rapid changes: only last value emitted; timer reset on each change.
- [ ] Delay change restarts the timer. Unmount clears the timer (no state update after unmount).
- [ ] Works with objects, `null`, `undefined`.

### `hooks/useVirtualScroll.ts`
- [ ] Default 0, custom initial value, updates from `event.target.scrollTop`, stable callback.

### `hooks/useBookSearch.ts` (mock `@/app/BooksApi`, fake timers)
- [ ] Initial books returned, no fetch on mount except the first debounced `''` search (document and pin; this is F5 territory).
- [ ] Typing: nothing fetched before 300 ms, one fetch after; typing 5 characters quickly -> one fetch for the last value.
- [ ] Cache: same query twice -> second served from cache, `isSearching` false, no fetch. `performSearch(q,false)` bypasses cache.
- [ ] `success:false` leaves previous books. Thrown error is swallowed and `isSearching` resets (finally).
- [ ] Empty result list replaces books (F4).
- [ ] `loadMore`: appends, ignores empty page, ignores re-entry while `loadingMore`, appends to cache entry only when the query is cached and non-empty, failure resets `loadingMore`.
- [ ] Race: search A in flight, user types B, A resolves late -> final books must be B (**likely fails today**, add stale-response guard).
- [ ] Debounce guard `debouncedSearchQuery !== searchQuery` skips a stale search.

### `src/app/lib/neon-local.ts`
- [ ] Not local host -> `neonConfig` untouched.
- [ ] Host `db.localtest.me` -> fetch endpoint, `wsProxy`, `useSecureWebSocket=false`, `pipelineConnect=false` set. `DATABASE_URL` unset/garbage -> no throw. Port 4444 and path `/sql`, `/v2`.

### QR generation (`manage/generate-qr-code/QrSheet.tsx`)
- Extract `buildCode` to `lib/qr.ts` so it can be tested directly.
- [ ] Module count: size matches QR version for a UUID-length payload; path is non-empty; deterministic for the same id; different ids differ.
- [ ] Regression: calling `modules.get` must keep `this` (the original NaN crash). Test with the real `qrcode` package, not a mock.
- [ ] Every `M..h1v1h-1z` coordinate is within `[0,size)`.

## 3. Data layer (`db/*`, `action.ts`, `manage/*/action.ts`)

Two levels. **Unit** (mocked `neon` / `pool`) checks SQL parameters, branching and error handling. **Integration** (real Postgres) checks triggers, constraints and transactions. Both are needed: triggers (`sync_book_counts`, `sync_copy_borrowed_flag`) cannot be tested with mocks.

### `db/books.ts`
Unit:
- [ ] `getBooks`: no cursor -> first-page query, cursor -> after-cursor query; blank and whitespace-only query uses the unfiltered query; `%` wrapping of the term; `size` forwarded; `parseInt(lastSeenId)` (`"0"` is falsy as a string? `"0"` is truthy, verify; `""` -> first page).
- [ ] `onboardBook`: existing ISBN10 hit -> no insert, copies added to existing book; ISBN10 missing -> falls back to ISBN13; neither exists -> creates; `copies: []` -> creates book, no copies; duplicate copies in the list; copy insert uses `ON CONFLICT DO NOTHING`; DB error propagates.
Integration:
- [ ] Search is case-insensitive, matches substrings, special characters `% _ ' "` (F9), unicode titles, 126-char titles.
- [ ] Cursor pagination: no overlap, no gaps, stable order, last page shorter than `size`, `lastSeenId` beyond max -> empty.
- [ ] `onboardBook`: `books.count` equals inserted copies (trigger); re-onboarding same ISBN adds copies to the same row; a QR already used by another book is skipped and **count does not change**; ISBN uniqueness constraint.
- [ ] Concurrency: two `onboardBook` calls for the same new ISBN at once -> one book, not two or an error.

### `db/borrowedBooks.ts`
Unit (`mockPool`, `mockSql`):
- [ ] `getBorrowedBooks` / `getReturnedBooks`: row mapping, empty, ordering as returned, ISO conversion, user id parameter.
- [ ] `checkBookCopyAvailability`: unknown code -> `{available:false}`; borrowed -> false; free -> true; DB throws -> false and logged.
- [ ] `borrowBook`: transaction order `BEGIN` -> select `FOR UPDATE` -> insert -> `COMMIT`; not found -> `ROLLBACK`, message `Book copy not found`; already borrowed -> `ROLLBACK`; insert throws -> `ROLLBACK`, generic message; `release()` called in **every** path including when `ROLLBACK` itself throws (**likely fails: unguarded rollback in `catch`**); never `COMMIT` on a failed path.
- [ ] `returnBook`: same matrix; not borrowed; borrowed by someone else -> `You have not borrowed this book`; success message.
Integration:
- [ ] Borrow sets `book_copies.borrowed` and increments `books.borrowed_count` (triggers).
- [ ] Return reverses both; `returned_at` set once and never overwritten.
- [ ] Two users borrow the same copy at once -> exactly one succeeds (row lock + unique open-loan index).
- [ ] Same user returns twice in parallel -> one success (F6).
- [ ] User B cannot return user A's copy.
- [ ] Borrowing a deleted/unknown QR; QR with whitespace; QR case sensitivity.
- [ ] `borrowed_count` never exceeds `count` or goes negative (check constraint).
- [ ] History: a copy borrowed, returned, borrowed again appears once in Reading and once in Past reads for the right users.

### `db/user.ts`
Unit:
- [ ] `getLoggedInUser`: no session -> `null` and **no SQL run**; session without `user`; unknown email -> `null`; found -> mapped fields; email passed as a parameter (never concatenated).
- [ ] `checkUserExists`, `checkIsUserAdmin` true/false; `checkIsUserAdmin` for non-admin row -> false.
- [ ] `bulkAddLibraryUsers`: counts added/skipped; existing email skipped; empty array; returns inserted rows only; error mid-way leaves earlier rows inserted (document, see F12).
- [ ] `updateUserRole`, `deleteLibraryUser` run one statement with correct params.
Integration:
- [ ] Email uniqueness; case-insensitive duplicate (`A@x.com` vs `a@x.com`) - **decide**: API lowercases but the column may not.
- [ ] `deleteLibraryUser`: user with no history is removed and matching NextAuth `users`, `accounts`, `sessions` cascade away; user with borrow history -> FK `23503`, **nothing deleted** (library user and NextAuth rows both remain); unknown id is a no-op.
- [ ] `getAllLibraryUsers` order by `created_at DESC`.

### `src/app/action.ts`
- [ ] `loadBooks` maps snake to camel case; max 20 rows; empty table.
- [ ] `loadBooksWithSearch` runs all four query branches; passes `size` default 20.
- [ ] `invalidateBooksCache` calls `revalidateTag('books','max')`.

### `manage/borrowed-books/action.ts`
- [ ] `getAllBorrowedBooks`: non-admin and anonymous both **throw** and run no SQL; admin gets rows mapped, `INNER JOIN` excludes users that were deleted.
- [ ] `forceReturnBook`: anonymous/non-admin -> `{success:false}` with no DB connection opened; admin success calls `COMMIT`, `revalidatePath('/manage/borrowed-books')` and `invalidateBooksCache`; DB error -> `ROLLBACK` and failure; `release()` always called; unknown id (F7); already-returned id keeps its original date.
- [ ] Integration: forced return fixes `borrowed` flag and `borrowed_count` (triggers).

### `src/app/history/action.ts`, `src/app/reading/action.ts`
- [ ] No user -> throws `User not logged in`; otherwise passes `user.id` through.

## 4. API route handlers (`src/app/api/**`) - P0

Call the exported `GET`/`POST`/`PATCH`/`DELETE` directly with `makeRequest`, mocking `db/*` and `getLoggedInUser`. For each route test **authN, authZ, validation, success, DB failure, response headers**.

Common matrix for every route:
- [ ] Anonymous -> 401 (or 403 for admin routes, note: be consistent).
- [ ] Authenticated non-admin on admin routes -> 403 and **no db function called**.
- [ ] Malformed JSON body -> 400 (today most routes return 500; fix).
- [ ] DB function throws -> 500 with generic message, no stack or SQL in body.

Per route:
- `GET /api/books`: missing `size` -> 20; `size=0`, `-1`, `abc`, `101` -> 400; `size=100` ok; `size=10abc` (pin); `search` URL-decoded once (F10); `lastSeenId` forwarded; `Cache-Control` header present; 401 when no session.
- `POST /api/books/borrow`: missing, non-string (`123`, `{}`, `[]`), empty and whitespace barcode -> 400; trims barcode before borrowing; unauthenticated -> 401 (and `borrowBook` not called); `success:false` -> 400 with the DB message; success -> 200 and `invalidateBooksCache` called once; cache **not** invalidated on failure.
- `POST /api/reading/return`: same validation; **F1**; success; unauthenticated.
- `GET /api/reading`: 401; success returns the user's books and `Cache-Control: private, no-cache`; uses the session user id, not a query param; DB error -> 500.
- `GET /api/book`: missing/blank barcode -> 400; found in `books_db` -> no external fetch; not found locally -> external lookup; not found anywhere -> 404; external API error -> 404 or 502 (decide, F17); barcode is parameterised (`'; DROP TABLE books_db; --`); F2 auth; cache header.
- `POST /api/books/on-board`: anonymous/non-admin -> 403; F8 validation matrix (missing title, authors, both ISBNs missing, bad ISBN lengths, `copies` missing/not array/non-strings/duplicates/empty strings); success calls `onboardBook` once and invalidates cache; no invalidation on failure.
- `GET/POST /api/users`: admin only; POST missing name/email -> 400; `batchId` missing, `"abc"`, `1.5`, `"12"` (accepted), `0`, negative (decide); trims and lowercases email; `isAdmin` truthy coercion (`"false"` string is truthy! - pin or fix); 201 with user; duplicate -> 409 (F11); other errors -> 500.
- `POST /api/users/bulk`: empty array, non-array, one bad row among good rows (all rejected), non-string fields (F12), 1,000 rows (performance/time), duplicates inside the list, response message counts.
- `PATCH /api/users/[id]`: non-admin 403; `id` = `abc` -> 400; `id` = `12abc` (`parseInt` accepts, pin); own id -> 400; `isAdmin` coerced; body missing -> 500 or 400; promote and demote; DB error.
- `DELETE /api/users/[id]`: same guards; own id -> 400; FK violation `23503` -> 409; other error -> 500; success.
- `/api/auth/[...nextauth]`: handler exports GET and POST (smoke test).
- [x] Authorisation matrix test (`src/app/api/__tests__/authorization.test.ts`, also fails when a new route is added without a case) (table-driven): every route x {anonymous, user, admin} against an expected status. This one test catches the most dangerous regression.

`books-archeive.ts` (mock `fetch`):
- [ ] Google hit; Open Library hit; both hit (Google wins); neither; Google `totalItems:0`; Google missing `items`; authors absent; ISBN identifiers absent / only one type; non-200; invalid JSON; network error on one source (F17); URL is correctly encoded for odd barcodes.

## 5. Auth (`src/app/lib/auth.ts`, `types/next-auth.d.ts`)
Done: `signIn` and `session` callbacks and config (`src/app/lib/__tests__/auth.test.ts`). Still to do: `layout.tsx`, `manage/layout.tsx` and page-level checks.
- [ ] `signIn` callback: no email -> false; email not in `library_users` -> false; email present -> true; case-sensitivity of the lookup; `checkUserExists` throws -> sign-in denied (not crash).
- [ ] `session` callback: admin flag true/false copied to `session.user.isAdmin`; F3; does not leak other fields.
- [ ] Provider configured with env credentials; `session.strategy` is `database`.
- [ ] `layout.tsx`: no session renders `<Login/>`; session renders `AppShell` with `isAdmin` coerced to boolean; `isAdmin` undefined -> false.
- [ ] `manage/layout.tsx`: anonymous -> `redirect('/login')`; non-admin -> `redirect('/')`; admin renders children. (Make `redirect` throw like Next does.)
- [ ] Every `manage/*/page.tsx`: non-admin never triggers its data fetch (F18).

## 6. Components (React Testing Library) - P1

Mock `fetch` / server actions; use `userEvent`; assert on roles and text, not class names.

- `AppShell`: nav items for user vs admin (Manage hidden for non-admin); active item and `aria-current` for `/`, `/reading`, `/reading/x`, `/history`, `/manage/users`; `/` must not match `/reading`; scanner selection (`ReturnBook` on `/reading`, `BorrowBook` elsewhere, none on `/manage`); `initials()` for `"Ada Lovelace"`, single name, empty name falling back to email, `a.b@x.com`, `"?"`; both sign-out buttons call `signOut`.
- `Books`, `Searchbar`, `AsyncSearchResults`, `VirtualizedBookList`, `BookRow`, `BookRowSkeleton`, `BookListSkeleton`, `LoadingFooter`: typing triggers search after debounce; Enter forces a fresh search; input disabled and spinner shown while searching; empty state with working "Clear search"; `BookRow` available = count - borrowed, "None left" tag only at 0, negative case; end reached loads more once; skeleton shown while loading; (mock `react-virtuoso` to render all items).
- `ReadingBooks`, `PastReads`: empty states, singular/plural counts, dates via fake timers, long titles, missing authors.
- `Scanner`, `BarcodeScanner`, `BorrowBook`, `ReturnBook`: FAB toggles scanner; scan result closes scanner and calls handler once (F14); error path shows snackbar and closes; loader overlay while request in flight; `BorrowBook` success/error messages from API; `ReturnBook` success refreshes router, failure shows server message; double scan while loading ignored. Mock `@yudiel/react-qr-scanner` and drive `onScan`/`onError`. Camera permission denied.
- `Snackbar`: shows only when open; auto close after `duration` (fake timers); no auto close when disabled; close button; timer cleared on unmount and when message changes; `role="status"`/`alert` by type.
- `LoaderOverlay`, `LoadingSpinner`, `IconButton`, `PrimaryButton`, `StepIcon`, `BookCover`, `ArrowBack`, `BackLink`, `FieldError` (renders nothing when message empty, has matching `id`), `ConfirmDialog` (focus moves in, Escape cancels, backdrop click, confirm/cancel callbacks, busy state disables buttons): render and interaction tests.
- `NewBookForm`: every validation message (title < 2 chars, authors < 2, ISBN10 with X and lowercase x, hyphens/spaces stripped, ISBN13 non-digits, neither ISBN); typing clears that field's error; "Enter at least one ISBN" clears when either ISBN is typed; ISBN scan -> prefill from `/api/book`, 404 and network error show the snackbar; copy scan de-duplicates; remove copy; submit success resets form and copies; failure keeps values; double submit blocked while loading; request body omits empty ISBNs; scanner open/close.
- `UsersManager`: add form validation (email regex, batch `0`, `012`, `1.5`, blank); 409 shows inline email error; success prepends user; role toggle optimistic or not, error rollback; cannot toggle/delete self (if enforced in UI); delete shows `ConfirmDialog`, cancel does nothing, confirm calls DELETE, 409 message; CSV: see below; `busy` blocks parallel actions.
  - `parseCSV` (export it): empty text; only blank lines; header row; `\r\n`; BOM; trailing comma; 2 columns; 5+ columns; whitespace; `TRUE`/`True`/`yes`; batch `abc`, `1.5`, `-1`; quoted comma (F15); 10,000 lines; duplicate emails.
  - File flow: no file selected; file with zero valid rows -> error; `FileReader` error; upload success summary adds `data.skipped + csv.skipped`; upload failure keeps preview; input value reset after upload.
- `BorrowedBooks` (manage): filter by title/author/name/email, case-insensitive, whitespace-trimmed; count text singular/plural/filtered; empty states (none borrowed vs no match); force return success removes row, failure keeps it and shows message; only one return at a time.
- `QrSheet`: default 12; stepper bounds 1..200 and NaN input; invalid inputs `0`, `-1`, `1.5`, `abc`, `""`, `201`; Generate renders N distinct codes; heading singular/plural; "Generating..." state; print button disabled until codes exist and calls `window.print`; **no text under codes** (regression for the removed code label); a second Generate replaces codes; unmount mid-generation does not set state.
- `ManagePage` hub: four links with correct `href`s.
- `Login`: **done** (10 tests). Add: renders without crash when `signIn` rejects (button stays usable).
- Offline pages (`offline`, `books-offline`, `manage-offline`): render, text, retry/link behaviour.
- `loading.tsx`: image has empty `alt`, sr-only label present.
- Accessibility sweep: run `vitest-axe` on every page-level component (no violations), keyboard-only flows for the scanner, dialog focus trap, form labels.

## 7. Route / page integration (RSC) - P2
- [ ] `page.tsx` files: render server component by `await`ing it with mocked loaders (`Home`, `ReadingPage`, history, manage pages) and assert props passed.
- [ ] `loading.tsx` and error states for pages whose loader throws.
- [ ] `next.config.ts`: service worker config sanity (regexes). Write unit tests for each `urlPattern`: `/api/books` matches, `/api/book-x`? , `/reading` matches `/readings`? (overly broad `/^.*\/books.*$/` also matches `/books-offline` and any URL containing `/books`) and the `fallbacks` mapping. Also that `/api/reading` responses are never cached for longer than 2 minutes (private data!). Review: caching `/manage` pages for 24h in the service worker can show stale admin data.

## 8. End-to-end (Playwright) against the compose stack - P1
Run against `docker compose up` (Postgres 18 + proxy + app on :3000) with a seeded database. **Do not use real Google.** Stub OAuth by creating a session row directly in `sessions` and setting the `next-auth.session-token` cookie (database sessions make this simple), or run a tiny mock OIDC provider.
- [ ] Anonymous visit to `/`, `/reading`, `/manage` shows login; `/api/books` returns 401.
- [ ] Non-library Google account is rejected at sign in (callback returns false).
- [ ] Member: browse, search, scroll to load more, borrow via QR scan (fake the camera with Chromium `--use-fake-device-for-media-stream --use-file-for-fake-video-capture`, or call the scan handler through a test hook), see it under Reading, return it, see it under Past reads.
- [ ] Two browser contexts borrow the same copy -> one wins, other gets the error toast.
- [ ] Admin: Manage visible, add book with copies, generate and print QR sheet (`emulateMedia print`: only codes visible), view borrowed books and force return, add user, CSV import, promote/demote, delete (with and without history).
- [ ] Member opens `/manage` -> redirected; calls admin APIs with their cookie -> 403.
- [ ] Sign out clears session; deleted user is signed out immediately.
- [ ] Responsive: 375, 768, 1280 widths (nav switches between bottom tabs and sidebar; table vs cards).
- [ ] PWA: manifest valid, service worker registers in production build, offline fallback page served when offline.
- [ ] Visual regression screenshots for login, books, reading, past reads and each manage page (design parity, fonts).
- [ ] Docker: `docker compose up` from clean volume reaches healthy with `/login` 200.

## 9. Scripts and infrastructure - P2
- [ ] `scripts/seed-admin.mjs`: skip without `SEED_ADMIN_EMAIL`; insert; idempotent (`ON CONFLICT` promotes); SQL-injection-safe (parameterised); bad DB URL exits non-zero. Test with a real Postgres.
- [ ] `scripts/db-dump.sh` and `db-restore.sh`: shellcheck, argument validation (bats): refuses non-postgres URL, creates output dir with mode 700, restore prompts unless `--yes`, refuses a non-local target without `--yes`, strips `-pooler`.
- [ ] `Dockerfile` / compose: build in CI, container runs as non-root, `DATABASE_URL` inside the app container is the local one (guards against production use), `.dockerignore` excludes `.env*` (test: image has no `.env`).
- [ ] Migrations: apply `0000`..`0008` to an empty DB, then to a DB restored from a prod-shaped dump fixture; assert idempotency (run twice), final schema equals `db/schema.ts` (drizzle-kit check), triggers exist, and `borrowed_count` / `count` sync migrations fix deliberately corrupted rows.

## 10. Mutation testing

Tool: **StrykerJS** with `@stryker-mutator/vitest-runner` and the TypeScript checker.

- [ ] Install, add `stryker.config.json`:
  - `mutate`: `db/**`, `src/app/api/**`, `src/app/action.ts`, `src/app/*/action.ts`, `src/app/lib/**`, `hooks/**`, `utils/**`, `components/**` (exclude `*.test.*`, `*.css`, `types/**`, icon components).
  - `testRunner: "vitest"`, `coverageAnalysis: "perTest"`, `checkers: ["typescript"]`, `incremental: true`.
  - Use the unit project only. Integration tests run in a separate, smaller mutation run for `db/` (slow).
  - `ignoreStatic`: true to skip string constants and logging noise. Add `// Stryker disable next-line StringLiteral` for log messages.
- [ ] Thresholds: `high 90`, `low 80`, **`break 75` initially**, raise by 5 each quarter. Per-area targets: `db/` and `api/` >= 90, hooks and utils >= 90, components >= 75.
- [ ] Baseline run and triage survivors. Typical ones this code will have, and the test that kills them:
  - `size > 100` -> `>= 100`: test `size=100` accepted and `size=101` rejected.
  - `size <= 0` -> `< 0`: test `size=0`.
  - `days < 30` / `days < 365` boundaries in `dateUtils`: test 29/30 and 364/365.
  - `!user || !user.isAdmin` -> `&&`: test anonymous **and** non-admin separately on every admin route.
  - `requestingUser.id === userId` -> `!==`: test self and other.
  - `if (loading) return` guards in forms: submit twice quickly.
  - `ROLLBACK` vs `COMMIT` ordering, missing `release()`: assert the client call log exactly.
  - `.trim()`, `.toLowerCase()` removal: whitespace and mixed-case inputs.
  - `Math.min(MAX_CODES, ...)` / `Math.max(1, ...)` in `QrSheet`: stepper bounds both ends.
  - Array/spread mutations in `useBookSearch` (`[...prev, ...data]` -> `data`): assert earlier books stay after `loadMore`.
  - Conditional `isAdmin` nav item: assert Manage absent for non-admin.
- [ ] Add `npm run test:mutation` and a nightly CI job that uploads the HTML report and fails under `break`. On PRs, run `--incremental` only on changed files.
- [ ] Complement with **property-based tests** (`fast-check`) for: date formatters (monotonic with elapsed time), `parseCSV` (never throws, `rows.length + skipped = nonblank lines`), ISBN validation, cursor pagination (concatenated pages equal the full list), and `initials` (always 1-2 uppercase characters).
- [ ] Database-level mutation check, manually or scripted: temporarily drop each trigger / constraint / unique index and confirm at least one integration test fails.

## 11. Security tests - P0
- [ ] SQL injection payloads in every string input (`search`, `barcode`, `email`, `title`) assert the table still exists and the literal is stored/searched.
- [ ] Stored XSS: titles/names containing `<script>`, `"><img onerror>` render as text in lists and in the snackbar.
- [ ] Mass assignment: `PATCH /api/users/[id]` with extra fields; `POST /api/users` with `isAdmin:true` as non-admin -> 403.
- [ ] IDOR: `GET /api/reading` ignores any `userId` query; return endpoint cannot return another user's copy.
- [ ] CSRF: state-changing routes require JSON content type; check behaviour for form-encoded POST.
- [ ] Rate and size limits: body size, 10,000-row bulk upload, `copies` array of 100,000 entries.
- [ ] Secrets: response bodies and logs never contain `DATABASE_URL`, tokens or stack traces (grep captured `console.error`).
- [ ] Headers: `Cache-Control` is `private` or `no-store` on every authenticated response (today `/api/books` is `public, s-maxage=300`, which a shared cache could serve to **anonymous** users - verify, since the handler requires a session).

## 12. Suggested order of work

Progress: step 1 done (171 tests passing: login 10, authorisation matrix 53, return/borrow/on-board routes, on-board validator, auth callbacks).

1. Infrastructure (section 1) and the authorisation matrix test (section 4). Fix F1, F2, F3, F8.
2. `dateUtils`, hooks, `parseCSV`, QR (section 2). Fast, high value, easy mutation wins.
3. DB integration tests for borrow/return/onboard/delete (section 3). Fix F6, F7, F9, F13.
4. Route handlers (section 4) and auth (section 5). Fix F10, F11, F12, F17.
5. Components (section 6), most-used first: `AppShell`, `Books`, scanner flows, `NewBookForm`, `UsersManager`.
6. Mutation baseline (section 10) and iterate on survivors.
7. Playwright E2E (section 8) and security checks (section 11).
8. CI, thresholds and nightly mutation job.

Rough size: about 450 unit/component tests, 60 integration tests, 25 E2E scenarios.
