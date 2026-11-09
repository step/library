// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest, params } from "../../../../test/helpers/request";
import { Identity, libraryUserFor, sessionFor } from "../../../../test/helpers/identity";

// ---- Mocks: no database, no Google, no network ---------------------------------------------
const state = vi.hoisted(() => ({ who: "anonymous" as Identity }));

const db = vi.hoisted(() => ({
    getLoggedInUser: vi.fn(),
    getAllLibraryUsers: vi.fn(),
    addLibraryUser: vi.fn(),
    bulkAddLibraryUsers: vi.fn(),
    updateUserRole: vi.fn(),
    deleteLibraryUser: vi.fn(),
    getBorrowedBooks: vi.fn(),
    borrowBook: vi.fn(),
    returnBook: vi.fn(),
    onboardBook: vi.fn(),
    loadBooksWithSearch: vi.fn(),
    invalidateBooksCache: vi.fn(),
    findBook: vi.fn(),
    getServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: db.getServerSession }));
vi.mock("@/app/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/app/lib/neon-local", () => ({}));
vi.mock("@neondatabase/serverless", () => ({
    neon: () => async () => [{ id: 5, title: "T", authors: "A", isbn10: "0123456789", isbn13: "" }],
}));
vi.mock("../../../../db/user", () => ({
    getLoggedInUser: db.getLoggedInUser,
    getAllLibraryUsers: db.getAllLibraryUsers,
    addLibraryUser: db.addLibraryUser,
    bulkAddLibraryUsers: db.bulkAddLibraryUsers,
    updateUserRole: db.updateUserRole,
    deleteLibraryUser: db.deleteLibraryUser,
}));
vi.mock("../../../../db/borrowedBooks", () => ({
    getBorrowedBooks: db.getBorrowedBooks,
    borrowBook: db.borrowBook,
    returnBook: db.returnBook,
}));
vi.mock("../../../../db/books", () => ({ onboardBook: db.onboardBook }));
vi.mock("../../action", () => ({
    loadBooksWithSearch: db.loadBooksWithSearch,
    invalidateBooksCache: db.invalidateBooksCache,
}));
vi.mock("../book/books-archeive", () => ({ findBook: db.findBook }));

import { GET as getBooks } from "../books/route";
import { POST as borrow } from "../books/borrow/route";
import { POST as onBoard } from "../books/on-board/route";
import { GET as getReading } from "../reading/route";
import { POST as returnBook } from "../reading/return/route";
import { POST as booksReturn } from "../books/return/route";
import { GET as getBook } from "../book/route";
import { GET as listUsers, POST as addUser } from "../users/route";
import { POST as bulkUsers } from "../users/bulk/route";
import { PATCH as patchUser, DELETE as deleteUser } from "../users/[id]/route";

type Case = {
    name: string;
    call: () => Promise<Response>;
    /** Expected status per identity. */
    expected: Record<Identity, number>;
    /** db functions that must NOT run when the caller is denied. */
    guarded: (keyof typeof db)[];
};

const OTHER_USER_ID = "999";
const book = { title: "Dune", authors: "Frank Herbert", isbn10: "0441172717", copies: ["qr-1"] };

const CASES: Case[] = [
    {
        name: "GET /api/books",
        call: () => getBooks(makeRequest("/api/books")),
        expected: { anonymous: 401, member: 200, admin: 200 },
        guarded: ["loadBooksWithSearch"],
    },
    {
        name: "POST /api/books/borrow",
        call: () => borrow(makeRequest("/api/books/borrow", { method: "POST", body: { barcode: "qr-1" } })),
        expected: { anonymous: 401, member: 200, admin: 200 },
        guarded: ["borrowBook"],
    },
    {
        name: "POST /api/reading/return",
        call: () => returnBook(makeRequest("/api/reading/return", { method: "POST", body: { barcode: "qr-1" } })),
        expected: { anonymous: 401, member: 200, admin: 200 },
        guarded: ["returnBook"],
    },
    {
        name: "POST /api/books/return",
        call: () => booksReturn(makeRequest("/api/books/return", { method: "POST", body: { barcode: "qr-1" } })),
        expected: { anonymous: 401, member: 200, admin: 200 },
        guarded: ["returnBook"],
    },
    {
        name: "GET /api/reading",
        call: () => getReading(),
        expected: { anonymous: 401, member: 200, admin: 200 },
        guarded: ["getBorrowedBooks"],
    },
    {
        name: "GET /api/book (ISBN lookup)",
        call: () => getBook(makeRequest("/api/book?barcode=0441172717")),
        expected: { anonymous: 401, member: 200, admin: 200 },
        guarded: ["findBook"],
    },
    {
        name: "POST /api/books/on-board",
        call: () => onBoard(makeRequest("/api/books/on-board", { method: "POST", body: book })),
        expected: { anonymous: 403, member: 403, admin: 200 },
        guarded: ["onboardBook", "invalidateBooksCache"],
    },
    {
        name: "GET /api/users",
        call: () => listUsers(),
        expected: { anonymous: 403, member: 403, admin: 200 },
        guarded: ["getAllLibraryUsers"],
    },
    {
        name: "POST /api/users",
        call: () => addUser(makeRequest("/api/users", { method: "POST", body: { name: "N", email: "n@x.com", batchId: 1 } })),
        expected: { anonymous: 403, member: 403, admin: 201 },
        guarded: ["addLibraryUser"],
    },
    {
        name: "POST /api/users/bulk",
        call: () => bulkUsers(makeRequest("/api/users/bulk", {
            method: "POST",
            body: { users: [{ name: "N", email: "n@x.com", batchId: 1 }] },
        })),
        expected: { anonymous: 403, member: 403, admin: 200 },
        guarded: ["bulkAddLibraryUsers"],
    },
    {
        name: "PATCH /api/users/[id]",
        call: () => patchUser(makeRequest(`/api/users/${OTHER_USER_ID}`, { method: "PATCH", body: { isAdmin: true } }), params(OTHER_USER_ID)),
        expected: { anonymous: 403, member: 403, admin: 200 },
        guarded: ["updateUserRole"],
    },
    {
        name: "DELETE /api/users/[id]",
        call: () => deleteUser(makeRequest(`/api/users/${OTHER_USER_ID}`, { method: "DELETE" }), params(OTHER_USER_ID)),
        expected: { anonymous: 403, member: 403, admin: 200 },
        guarded: ["deleteLibraryUser"],
    },
];

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.getLoggedInUser.mockImplementation(async () => libraryUserFor(state.who));
    db.getServerSession.mockImplementation(async () => sessionFor(state.who));
    db.loadBooksWithSearch.mockResolvedValue([]);
    db.getBorrowedBooks.mockResolvedValue([]);
    db.borrowBook.mockResolvedValue({ success: true, message: "ok" });
    db.returnBook.mockResolvedValue({ success: true, message: "ok" });
    db.onboardBook.mockResolvedValue(undefined);
    db.invalidateBooksCache.mockResolvedValue(undefined);
    db.getAllLibraryUsers.mockResolvedValue([]);
    db.addLibraryUser.mockResolvedValue({ id: 50, name: "N", email: "n@x.com", isAdmin: false, batchId: 1 });
    db.bulkAddLibraryUsers.mockResolvedValue({ added: 1, skipped: 0, users: [] });
    db.updateUserRole.mockResolvedValue(undefined);
    db.deleteLibraryUser.mockResolvedValue(undefined);
    db.findBook.mockResolvedValue({ title: "T", authors: "A", isbn10: "", isbn13: "" });
});

describe("route authorisation matrix", () => {
    const identities: Identity[] = ["anonymous", "member", "admin"];

    for (const c of CASES) {
        describe(c.name, () => {
            for (const who of identities) {
                it(`${who} -> ${c.expected[who]}`, async () => {
                    state.who = who;
                    const res = await c.call();
                    expect(res.status).toBe(c.expected[who]);

                    if (c.expected[who] === 401 || c.expected[who] === 403) {
                        for (const fn of c.guarded) {
                            expect(db[fn], `${fn} must not run for ${who}`).not.toHaveBeenCalled();
                        }
                    }
                });
            }

            it("never leaks stack traces or SQL in a denied response", async () => {
                state.who = "anonymous";
                const text = await (await c.call()).text();
                expect(text).not.toMatch(/\bat .*\(.*:\d+:\d+\)/);
                expect(text.toLowerCase()).not.toMatch(/select |insert |update |delete from/);
            });
        });
    }

    it("covers every route handler (add new routes to CASES)", async () => {
        const { readdirSync, statSync } = await import("node:fs");
        const { join } = await import("node:path");
        const apiDir = join(__dirname, "..");
        const routes: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir)) {
                if (entry === "__tests__") continue;
                const full = join(dir, entry);
                if (statSync(full).isDirectory()) walk(full);
                else if (entry === "route.ts") routes.push(full.slice(apiDir.length).replace(/\/route\.ts$/, "") || "/");
            }
        };
        walk(apiDir);
        // NextAuth's own catch-all is covered by its library.
        const ours = routes.filter(r => !r.includes("[...nextauth]")).sort();
        expect(ours).toEqual([
            "/book",
            "/books",
            "/books/borrow",
            "/books/on-board",
            "/books/return",
            "/reading",
            "/reading/return",
            "/users",
            "/users/[id]",
            "/users/bulk",
        ]);
    });
});

describe("admin self-protection", () => {
    it("an admin cannot demote themselves", async () => {
        state.who = "admin";
        const res = await patchUser(makeRequest("/api/users/1", { method: "PATCH", body: { isAdmin: false } }), params("1"));
        expect(res.status).toBe(400);
        expect(db.updateUserRole).not.toHaveBeenCalled();
    });

    it("an admin cannot delete themselves", async () => {
        state.who = "admin";
        const res = await deleteUser(makeRequest("/api/users/1", { method: "DELETE" }), params("1"));
        expect(res.status).toBe(400);
        expect(db.deleteLibraryUser).not.toHaveBeenCalled();
    });
});

describe("a member cannot act as someone else", () => {
    it("GET /api/reading ignores a userId query and uses the signed-in library user", async () => {
        state.who = "member";
        await getReading();
        expect(db.getBorrowedBooks).toHaveBeenCalledWith(libraryUserFor("member")!.id);
    });

    it("borrow and return use the signed-in user's id, not one from the body", async () => {
        state.who = "member";
        await borrow(makeRequest("/api/books/borrow", { method: "POST", body: { barcode: "qr-1", userId: 1 } }));
        await returnBook(makeRequest("/api/reading/return", { method: "POST", body: { barcode: "qr-1", userId: 1 } }));
        expect(db.borrowBook).toHaveBeenCalledWith(libraryUserFor("member")!.id, "qr-1");
        expect(db.returnBook).toHaveBeenCalledWith(libraryUserFor("member")!.id, "qr-1");
    });
});
