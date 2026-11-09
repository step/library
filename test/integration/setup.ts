import { afterAll, beforeEach, vi } from "vitest";
import { TEST_DB_URL, assertSafeTestDatabase } from "./config";
import { closeFixtures, truncateAll } from "./fixtures";

assertSafeTestDatabase(TEST_DB_URL);
process.env.DATABASE_URL = TEST_DB_URL;

vi.mock("@neondatabase/serverless", async () => await import("./pgNeon"));

beforeEach(async () => {
    await truncateAll();
});

afterAll(async () => {
    const { closeAllPools } = await import("./pgNeon");
    await closeAllPools();
    await closeFixtures();
});
