# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server with Turbopack
npm run build      # Production build
npm run lint       # Run ESLint
npm run analyze    # Analyze bundle size
```

There are no test commands — this project has no test suite.

## Architecture

**STEP Library** is a Next.js 15 (App Router) PWA for managing a community book-lending library. Users sign in with Google, browse books, borrow and return copies tracked by QR codes.

### Key layers

| Layer | Location | Role |
|---|---|---|
| Pages / UI | `src/app/` | Next.js App Router pages |
| Components | `components/` | Shared React components |
| Server Actions | `src/app/action.ts` | Mutations (borrow, return, add book) |
| API routes | `src/app/api/` | REST endpoints called by client hooks |
| DB functions | `db/` | Raw SQL via `@neondatabase/serverless` |
| Auth | `src/app/lib/auth.ts` | NextAuth.js v4 + Google OAuth |
| DB connection | `src/app/lib/db.ts` | Neon serverless pool |

### Routing

- `/` — Book catalog (browse + borrow)
- `/reading` — Books currently borrowed by the signed-in user
- `/manage` — Admin hub (add books, view all borrows, generate QR codes)
- `/login` — Google OAuth sign-in
- `/request` — Request a book
- Offline fallback pages: `/books-offline`, `/manage-offline`, `/offline`
- API: `/api/books/`, `/api/books/borrow/`, `/api/books/return/`, `/api/books/on-board/`, `/api/reading/`

### Database schema (PostgreSQL / Neon)

- `books` — catalog (id, title, authors, isbn10, isbn13, count, borrowed_count)
- `book_copies` — physical copies with QR codes; `borrowed` flag tracks status
- `borrowed_books` — borrow/return history linking copies to users
- `library_users` — app users with `is_admin` flag (separate from NextAuth tables)
- `book_ratings` — one 1–5 star rating per (user, book); rating again replaces it. Only a user with a returned loan of the book may rate it. `books.rating_count` / `rating_sum` are kept in sync by the `sync_book_rating_totals` trigger, and the catalogue reads the average from them
- NextAuth tables: `users`, `accounts`, `sessions`, `verification_token`

Books use a GIN trigram index (`idx_books_title_gin`) for fuzzy title search. Pagination is cursor-based.

### Authentication & authorization

NextAuth.js stores sessions in the database (Neon adapter). The sign-in callback checks that the Google-authenticated email exists in `library_users`. The `isAdmin` flag is injected into the session via the session callback. There is no middleware: every page and API route checks the session itself (`getServerSession` or `getLoggedInUser()`).

### Caching strategy

- **Server-side**: `react/cache` for per-request deduplication; `next/cache` (`unstable_cache`) with tags for persistent caching; invalidated on writes via `invalidateBooksCache()`.
- **PWA / Service Worker**: Google Fonts (1 year), book API (5 min), pages (24 h). Configured in `next.config.ts`.

### Notable patterns

- All database writes (borrow, return) use SQL transactions.
- API routes log timestamp, user, and request duration.
- `useBookSearch` hook handles debounced search (300 ms), pagination, and client-side caching.
- `react-virtuoso` for virtual scrolling of large book lists.
- QR scanning via `@yudiel/react-qr-scanner`; generation via `qrcode`.

### Environment variables required

```
DATABASE_URL          # Neon PostgreSQL connection string
NEXTAUTH_SECRET
NEXTAUTH_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
```
