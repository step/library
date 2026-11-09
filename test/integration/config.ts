// Connection settings for the integration test database. Never reads .env.
export const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://library:library@localhost:5433/postgres";
export const TEST_DB_NAME = "library_test";
export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? `postgres://library:library@localhost:5433/${TEST_DB_NAME}`;

const SAFE_HOSTS = new Set(["localhost", "127.0.0.1", "db.localtest.me", "postgres"]);

/** Refuses to run against anything that is not a local database whose name ends in _test. */
export const assertSafeTestDatabase = (url: string) => {
    const u = new URL(url);
    if (!SAFE_HOSTS.has(u.hostname)) {
        throw new Error(`Refusing to run integration tests against non-local host "${u.hostname}"`);
    }
    if (!u.pathname.slice(1).endsWith("_test")) {
        throw new Error(`Refusing to run integration tests: database "${u.pathname.slice(1)}" does not end in _test`);
    }
};
