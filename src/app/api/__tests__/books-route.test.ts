// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "../../../../test/helpers/request";
import { sessionFor } from "../../../../test/helpers/identity";

const m = vi.hoisted(() => ({ getServerSession: vi.fn(), loadBooksWithSearch: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: m.getServerSession }));
vi.mock("@/app/lib/auth", () => ({ authOptions: {} }));
vi.mock("../../action", () => ({ loadBooksWithSearch: m.loadBooksWithSearch }));

import { GET } from "../books/route";

const get = (qs = "") => GET(makeRequest(`/api/books${qs}`));

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.getServerSession.mockResolvedValue(sessionFor("member"));
    m.loadBooksWithSearch.mockResolvedValue([{ id: 1 }]);
});

describe("GET /api/books", () => {
    it("returns the books, with defaults: no search, no cursor, 20 per page", async () => {
        const res = await get();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([{ id: 1 }]);
        expect(m.loadBooksWithSearch).toHaveBeenCalledWith("", undefined, 20);
    });

    it("forwards search, cursor and size", async () => {
        await get("?search=dune&lastSeenId=42&size=50");
        expect(m.loadBooksWithSearch).toHaveBeenCalledWith("dune", "42", 50);
    });

    it("treats lastSeenId=0 (the client's first page) as a cursor of 0", async () => {
        await get("?lastSeenId=0&size=20&search=");
        expect(m.loadBooksWithSearch).toHaveBeenCalledWith("", "0", 20);
    });

    describe("size", () => {
        it.each(["1", "20", "100"])("accepts %s", async (size) => {
            expect((await get(`?size=${size}`)).status).toBe(200);
        });
        it.each(["0", "-1", "abc", "10abc", "1.5", "1e2", "101", "1000", "%20", "NaN"])("rejects %s", async (size) => {
            const res = await get(`?size=${size}`);
            expect(res.status).toBe(400);
            expect(m.loadBooksWithSearch).not.toHaveBeenCalled();
        });
        it("falls back to 20 when size is present but empty", async () => {
            await get("?size=");
            expect(m.loadBooksWithSearch).toHaveBeenCalledWith("", undefined, 20);
        });
    });

    describe("lastSeenId", () => {
        it.each(["abc", "1.5", "-1", "1;DROP", "NaN"])("rejects %s with 400 (used to reach the database as NaN)", async (id) => {
            expect((await get(`?lastSeenId=${encodeURIComponent(id)}`)).status).toBe(400);
            expect(m.loadBooksWithSearch).not.toHaveBeenCalled();
        });
    });

    describe("search text", () => {
        it("is URL-decoded exactly once", async () => {
            await get("?search=the%20hobbit");
            expect(m.loadBooksWithSearch).toHaveBeenCalledWith("the hobbit", undefined, 20);
        });
        it("a literal percent sign works (used to give 500 from a second decode)", async () => {
            const res = await get("?search=100%25");
            expect(res.status).toBe(200);
            expect(m.loadBooksWithSearch).toHaveBeenCalledWith("100%", undefined, 20);
        });
        it("text that looks percent-encoded is not decoded again", async () => {
            await get("?search=%2541");
            expect(m.loadBooksWithSearch).toHaveBeenCalledWith("%41", undefined, 20);
        });
        it("unicode and plus signs survive", async () => {
            await get(`?search=${encodeURIComponent("Les Misérables 三体 C++")}`);
            expect(m.loadBooksWithSearch).toHaveBeenCalledWith("Les Misérables 三体 C++", undefined, 20);
        });
    });

    it("answers 401 without a session, and never loads books", async () => {
        m.getServerSession.mockResolvedValue(null);
        expect((await get()).status).toBe(401);
        expect(m.loadBooksWithSearch).not.toHaveBeenCalled();
    });

    it("sets a cache header on success", async () => {
        expect((await get()).headers.get("Cache-Control")).toMatch(/s-maxage=300/);
    });

    it("answers 500 without details when loading fails", async () => {
        m.loadBooksWithSearch.mockRejectedValue(new Error("password=hunter2"));
        const res = await get();
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain("hunter2");
    });
});
