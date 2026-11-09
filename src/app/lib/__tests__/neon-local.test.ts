// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const config = vi.hoisted(() => ({} as Record<string, unknown>));
vi.mock("@neondatabase/serverless", () => ({ neonConfig: config }));

const load = async (url: string | undefined) => {
    for (const k of Object.keys(config)) delete config[k];
    vi.resetModules();
    if (url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = url;
    await import("../neon-local");
};

const original = process.env.DATABASE_URL;
afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original;
});
beforeEach(() => vi.resetModules());

describe("neon-local", () => {
    describe("pointing at the local container database", () => {
        const LOCAL = "postgres://library:library@db.localtest.me:5432/library";

        it("routes HTTP queries to the proxy on port 4444", async () => {
            await load(LOCAL);
            const fetchEndpoint = config.fetchEndpoint as (host: string) => string;
            expect(fetchEndpoint("db.localtest.me")).toBe("http://db.localtest.me:4444/sql");
        });

        it("routes WebSocket connections to the proxy", async () => {
            await load(LOCAL);
            const wsProxy = config.wsProxy as (host: string) => string;
            expect(wsProxy("db.localtest.me")).toBe("db.localtest.me:4444/v2");
        });

        it("turns off TLS and pipelined connects, which the proxy does not support", async () => {
            await load(LOCAL);
            expect(config.useSecureWebSocket).toBe(false);
            expect(config.pipelineConnect).toBe(false);
        });

        it("matches whatever port, user and database the URL has", async () => {
            await load("postgres://x:y@db.localtest.me:6543/other?sslmode=disable");
            expect(config.fetchEndpoint).toBeTypeOf("function");
        });
    });

    describe("anything else must be left alone (never redirect production traffic)", () => {
        it.each([
            ["a Neon pooled URL", "postgresql://u:p@ep-cool-wind-pooler.ap-southeast-1.aws.neon.tech/library?sslmode=require"],
            ["localhost", "postgres://u:p@localhost:5432/library"],
            ["127.0.0.1", "postgres://u:p@127.0.0.1:5432/library"],
            ["the compose service name", "postgres://u:p@postgres:5432/library"],
            ["a look-alike host", "postgres://u:p@db.localtest.me.evil.com:5432/library"],
            ["a look-alike prefix", "postgres://u:p@evil-db.localtest.me:5432/library"],
            ["the local name only in the password", "postgres://u:db.localtest.me@neon.tech/library"],
            ["the local name only in the path", "postgres://u:p@neon.tech/db.localtest.me"],
        ])("%s", async (_n, url) => {
            await load(url);
            expect(config).toEqual({});
        });

        it.each([undefined, "", "not a url", "postgres://"])("does not throw for DATABASE_URL=%j", async (url) => {
            await expect(load(url)).resolves.toBeUndefined();
            expect(config).toEqual({});
        });
    });
});
