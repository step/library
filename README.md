# STEP Library

A webapp to manage STEP library.

## Development
This app is built using nextjs. Follow below sets for local setup.

- Clone this repository
- Install dependencies using `npm i`
- Copy `.env.example` to `.env.local` and fill in the required environment variables
- Run development server using `npm run dev`
- Build production app using `npm run build`
- Run production app using `npm start`

## Running with Docker

The whole stack (Postgres, a Neon proxy, migrations and the app) runs in containers:

```bash
# Optional: make a Google account the first admin so sign-in works on the empty database
export SEED_ADMIN_EMAIL=you@gmail.com SEED_ADMIN_NAME="Your Name"

npm run docker:up      # build and start everything -> http://localhost:3000
npm run docker:down    # stop (data is kept in the library_db volume)
npm run docker:reset   # stop and delete the database volume
```

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `NEXTAUTH_SECRET` are read from your shell or `.env`.
  `DATABASE_URL` and `NEXTAUTH_URL` are always overridden by `docker-compose.yml`, so the remote database is never touched.
- Add `http://localhost:3000/api/auth/callback/google` to the OAuth client's authorised redirect URIs.
- Host ports: app `3000` (stop `npm run dev` first), Postgres `5433`, Neon proxy `4444`.
- Changed code? Run `npm run docker:up` again; it rebuilds the app image.
- A change to `POSTGRES_USER`/`POSTGRES_PASSWORD` only applies to a fresh volume, so run `npm run docker:reset` first.

### Why a proxy?

The app uses the Neon serverless driver, which cannot talk to plain Postgres directly (it speaks HTTP and WebSocket).
`local-neon-http-proxy` translates for it. `src/app/lib/neon-local.ts` switches the driver over only when
`DATABASE_URL` points at `db.localtest.me`, so deployed environments are unaffected.

### `npm run dev` on your machine against the container database

```bash
docker compose up -d postgres neon-proxy
cp .env.example .env.local     # overrides .env
npm run db:migrate:local       # create the schema (the compose stack does this itself)
npm run dev
```

Delete `.env.local` and restart to go back to the remote database.

## Environment Variables

The following environment variables are required:

- `NEXTAUTH_SECRET`: Secret key for NextAuth.js JWT signing
- `NEXTAUTH_URL`: The canonical URL of your site
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret
- `DATABASE_URL`: Database connection string

## Authentication & Authorization

This application uses NextAuth.js for authentication with Google OAuth. A middleware is implemented to protect all API routes (except authentication routes) and ensures only logged-in users can access the API endpoints.

### Protected Routes
- All `/api/*` routes except `/api/auth/*`
- Middleware automatically returns 401 Unauthorized for unauthenticated requests

### User Information Injection

The middleware fetches user information once and injects it into request headers for efficient access in route handlers:

```typescript
// In route handlers, get user info from middleware headers
import { requireUserFromHeaders } from "../../../utils/userHeaders";

export async function GET(request: NextRequest) {
    const user = requireUserFromHeaders(request.headers);
    // user object contains: { id, name, email, isAdmin }
}
```

### Admin-Only Routes

For routes requiring admin privileges:

```typescript
import { requireAdminUser, createForbiddenResponse } from "../../../utils/adminAuth";

export async function POST(request: NextRequest) {
    try {
        const adminUser = requireAdminUser(request.headers);
        // Proceed with admin-only logic
    } catch (error) {
        return createForbiddenResponse("Admin access required");
    }
}
```

### Available Utilities

- `getUserFromHeaders(headers)`: Get user info (returns null if not found)
- `requireUserFromHeaders(headers)`: Get user info (throws if not found)
- `requireAdminUser(headers)`: Get admin user (throws if not admin)
- `isAdminUser(headers)`: Check if user is admin (boolean)
- `createForbiddenResponse(message)`: Create standardized 403 response
