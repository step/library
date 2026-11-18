// Applies pending drizzle migrations during a Vercel production deploy.
//
// Run by the `vercel-build` script after `next build`, so a failed build never
// leaves the database ahead of the code that is live. Preview and development
// deploys skip it: they share the database, and a PR's migration must not run
// before the PR is merged.
//
// Uses drizzle-orm's migrator rather than `drizzle-kit migrate`, because the
// migrator throws on a failed statement (failing the deploy), while
// drizzle-kit has been seen to swallow errors and exit 0. Both record applied
// migrations in the same drizzle.__drizzle_migrations table.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const env = process.env.VERCEL_ENV;
if (env !== "production") {
  console.log(`[migrate] skipped: VERCEL_ENV is ${env ?? "unset"}, not production`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

// Connect directly, not through Neon's pooler, as drizzle.config.ts does.
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL.replace("-pooler", ""),
  max: 1,
});

try {
  const started = Date.now();
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log(`[migrate] database is up to date (${Date.now() - started} ms)`);
} catch (error) {
  console.error("[migrate] failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
