import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { ADMIN_URL, TEST_DB_NAME, TEST_DB_URL, assertSafeTestDatabase } from "./config";

/** Recreates library_test from scratch and applies every drizzle migration in order. */
export default async function setup() {
    assertSafeTestDatabase(TEST_DB_URL);

    const admin = new pg.Client({ connectionString: ADMIN_URL });
    try {
        await admin.connect();
    } catch (e) {
        throw new Error(
            `Cannot reach Postgres at ${new URL(ADMIN_URL).host}. Start it with "docker compose up -d postgres". (${(e as Error).message})`,
        );
    }
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    await admin.end();

    const client = new pg.Client({ connectionString: TEST_DB_URL });
    await client.connect();
    const dir = path.resolve(__dirname, "../../drizzle");
    const files = readdirSync(dir).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
    for (const file of files) {
        const statements = readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint");
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    await client.query(statement);
                } catch (e) {
                    throw new Error(`Migration ${file} failed: ${(e as Error).message}\n${statement.slice(0, 200)}`);
                }
            }
        }
    }
    await client.end();

    return async () => {
        const cleanup = new pg.Client({ connectionString: ADMIN_URL });
        await cleanup.connect();
        await cleanup.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
        await cleanup.end();
    };
}
