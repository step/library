// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "../../../../test/helpers/request";
import { sessionFor } from "../../../../test/helpers/identity";

const m = vi.hoisted(() => ({ getServerSession: vi.fn(), rows: [] as unknown[], sqlCalls: [] as unknown[][] }));
vi.mock("next-auth", () => ({ getServerSession: m.getServerSession }));
vi.mock("@/app/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/app/lib/neon-local", () => ({}));
vi.mock("@neondatabase/serverless", () => ({
    neon: () => async (_s: TemplateStringsArray, ...values: unknown[]) => { m.sqlCalls.push(values); return m.rows; },
}));

import { GET } from "../book/route";
import { findBook } from "../book/books-archeive";

const lookup = (barcode?: string) => GET(makeRequest(`/api/book${barcode === undefined ? "" : `?barcode=${encodeURIComponent(barcode)}`}`));

/** Stubs the two external services. Anything else throws, so a test can never hit the network. */
const stubFetch = (handlers: { google?: () => Response | Promise<Response>; openLibrary?: () => Response | Promise<Response> }) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
        calls.push(url);
        if (url.startsWith("https://www.googleapis.com/")) return handlers.google!();
        if (url.startsWith("https://openlibrary.org/")) return handlers.openLibrary!();
        throw new Error(`unexpected URL ${url}`);
    });
    return calls;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const google = (volumeInfo: unknown) => json({ totalItems: 1, items: [{ volumeInfo }] });
const none = () => ({ google: () => json({ totalItems: 0 }), openLibrary: () => json({}) });

beforeEach(() => {
    vi.clearAllMocks();
    m.rows = [];
    m.sqlCalls = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.getServerSession.mockResolvedValue(sessionFor("admin"));
});

describe("GET /api/book", () => {
    it("answers 401 without a session and never looks anything up", async () => {
        m.getServerSession.mockResolvedValue(null);
        const calls = stubFetch(none());
        expect((await lookup("9780441172719")).status).toBe(401);
        expect(calls).toEqual([]);
        expect(m.sqlCalls).toEqual([]);
    });

    it.each([undefined, "", "   "])("rejects barcode %j with 400", async (barcode) => {
        const calls = stubFetch(none());
        expect((await lookup(barcode)).status).toBe(400);
        expect(calls).toEqual([]);
    });

    it("returns a book already in the local catalogue without calling the outside services", async () => {
        m.rows = [{ id: 9, title: "Dune", authors: "FH", isbn10: "0441172717", isbn13: "9780441172719" }];
        const calls = stubFetch(none());
        const res = await lookup("9780441172719");
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: 9, title: "Dune", authors: "FH", isbn10: "0441172717", isbn13: "9780441172719", borrowedCount: 0, count: 0 });
        expect(calls).toEqual([]);
        expect(res.headers.get("Cache-Control")).toMatch(/private, max-age=3600/);
    });

    it("trims the barcode and passes it to SQL as a parameter", async () => {
        m.rows = [{ id: 1, title: "t", authors: "a", isbn10: "", isbn13: "" }];
        stubFetch(none());
        await lookup("  0441172717  ");
        expect(m.sqlCalls[0]).toEqual(["0441172717", "0441172717"]);
    });

    it("treats an injection-looking barcode as plain text", async () => {
        stubFetch(none());
        const res = await lookup("x' OR '1'='1");
        expect(res.status).toBe(404);
        expect(m.sqlCalls[0]).toEqual(["x' OR '1'='1", "x' OR '1'='1"]);
    });

    it("falls back to the outside services with id -1 and zero counts", async () => {
        stubFetch({
            google: () => google({ title: "Dune", authors: ["Frank Herbert"], industryIdentifiers: [{ type: "ISBN_13", identifier: "9780441172719" }] }),
            openLibrary: () => json({}),
        });
        const res = await lookup("9780441172719");
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ id: -1, title: "Dune", authors: "Frank Herbert", isbn10: "", isbn13: "9780441172719", borrowedCount: 0, count: 0 });
    });

    it("answers 404 when nobody knows the book", async () => {
        stubFetch(none());
        const res = await lookup("0000000000");
        expect(res.status).toBe(404);
        expect((await res.json()).message).toBe("Book not found");
    });

    it("answers 404 (not 500) when both outside services are down", async () => {
        stubFetch({ google: () => { throw new Error("ECONNRESET"); }, openLibrary: () => json({}, 503) });
        expect((await lookup("0000000000")).status).toBe(404);
    });

    it("answers 500 without details when the local database fails", async () => {
        vi.doMock("@neondatabase/serverless", () => ({ neon: () => async () => { throw new Error("pw=secret"); } }));
        vi.resetModules();
        const { GET: freshGet } = await import("../book/route");
        stubFetch(none());
        const res = await freshGet(makeRequest("/api/book?barcode=123"));
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain("secret");
        vi.doUnmock("@neondatabase/serverless");
    });
});

describe("findBook (Google Books + Open Library)", () => {
    it("returns the Google result when both answer, preferring Google", async () => {
        stubFetch({
            google: () => google({ title: "From Google", authors: ["A", "B"] }),
            openLibrary: () => json({ "ISBN:123": { title: "From OL", authors: [{ name: "C" }] } }),
        });
        expect(await findBook("123")).toMatchObject({ title: "From Google", authors: "A, B" });
    });

    it("uses Open Library when Google has nothing", async () => {
        stubFetch({
            google: () => json({ totalItems: 0 }),
            openLibrary: () => json({ "ISBN:123": { title: "From OL", authors: [{ name: "C" }, { name: "D" }], identifiers: { isbn_10: ["0123456789"], isbn_13: ["9780123456789"] } } }),
        });
        expect(await findBook("123")).toEqual({ title: "From OL", authors: "C,D", isbn10: "0123456789", isbn13: "9780123456789" });
    });

    it("still returns Open Library's answer when Google throws (used to lose it)", async () => {
        stubFetch({
            google: () => { throw new TypeError("fetch failed"); },
            openLibrary: () => json({ "ISBN:123": { title: "From OL" } }),
        });
        expect(await findBook("123")).toMatchObject({ title: "From OL" });
    });

    it("still returns Google's answer when Open Library throws or returns junk", async () => {
        stubFetch({ google: () => google({ title: "From Google" }), openLibrary: () => { throw new Error("down"); } });
        expect(await findBook("123")).toMatchObject({ title: "From Google" });
        stubFetch({ google: () => google({ title: "From Google" }), openLibrary: () => new Response("<html>oops</html>", { status: 200 }) });
        expect(await findBook("123")).toMatchObject({ title: "From Google" });
    });

    it.each([
        ["totalItems 0", { totalItems: 0 }],
        ["no items key (used to throw)", { kind: "books#volumes" }],
        ["empty items", { totalItems: 1, items: [] }],
        ["item without a title", { totalItems: 1, items: [{ volumeInfo: {} }] }],
        ["item without volumeInfo", { totalItems: 1, items: [{}] }],
        ["null body", null],
    ])("treats Google's %s as not found", async (_n, body) => {
        stubFetch({ google: () => json(body), openLibrary: () => json({}) });
        expect(await findBook("123")).toBeUndefined();
    });

    it("treats a non-200 from either service as not found", async () => {
        stubFetch({ google: () => json({ error: "quota" }, 429), openLibrary: () => json({}, 500) });
        expect(await findBook("123")).toBeUndefined();
    });

    it("ignores an error response even when its body looks like a book", async () => {
        stubFetch({
            google: () => json({ totalItems: 1, items: [{ volumeInfo: { title: "Cached junk" } }] }, 500),
            openLibrary: () => json({ "ISBN:123": { title: "Also junk" } }, 503),
        });
        expect(await findBook("123")).toBeUndefined();
    });

    it("Open Library: fills missing authors and identifiers with empty strings, and reads the first of each ISBN", async () => {
        stubFetch({ google: () => json({ totalItems: 0 }), openLibrary: () => json({ "ISBN:123": { title: "T" } }) });
        expect(await findBook("123")).toEqual({ title: "T", authors: "", isbn10: "", isbn13: "" });
        stubFetch({
            google: () => json({ totalItems: 0 }),
            openLibrary: () => json({ "ISBN:123": { title: "T", identifiers: { isbn_10: ["1111111111", "2"], isbn_13: ["9781111111111"] } } }),
        });
        expect(await findBook("123")).toMatchObject({ isbn10: "1111111111", isbn13: "9781111111111" });
    });

    it("Open Library: ignores an entry without a title, and answers for the wrong key", async () => {
        stubFetch({ google: () => json({ totalItems: 0 }), openLibrary: () => json({ "ISBN:123": { authors: [{ name: "A" }] } }) });
        expect(await findBook("123")).toBeUndefined();
        stubFetch({ google: () => json({ totalItems: 0 }), openLibrary: () => json({ "ISBN:999": { title: "Other book" } }) });
        expect(await findBook("123")).toBeUndefined();
    });

    it("fills missing authors and identifiers with empty strings", async () => {
        stubFetch({ google: () => google({ title: "T" }), openLibrary: () => json({}) });
        expect(await findBook("123")).toEqual({ title: "T", authors: "", isbn10: "", isbn13: "" });
    });

    it("picks the right identifier types from Google", async () => {
        stubFetch({
            google: () => google({ title: "T", industryIdentifiers: [{ type: "OTHER", identifier: "x" }, { type: "ISBN_10", identifier: "0123456789" }, { type: "ISBN_13", identifier: "9780123456789" }] }),
            openLibrary: () => json({}),
        });
        expect(await findBook("123")).toMatchObject({ isbn10: "0123456789", isbn13: "9780123456789" });
    });

    it("URL-encodes the barcode in both requests", async () => {
        const calls = stubFetch(none());
        await findBook("1 2&x=y#z");
        expect(calls).toHaveLength(2);
        for (const url of calls) {
            expect(url).not.toMatch(/[ #]/);
            expect(url).not.toContain("&x=y");
        }
    });

    it("asks both services at the same time", async () => {
        const order: string[] = [];
        vi.stubGlobal("fetch", async (url: string) => {
            order.push(`start ${url.includes("google") ? "G" : "O"}`);
            await new Promise(r => setTimeout(r, 10));
            order.push(`end ${url.includes("google") ? "G" : "O"}`);
            return json({});
        });
        await findBook("123");
        expect(order.slice(0, 2)).toEqual(["start G", "start O"]);
    });
});
