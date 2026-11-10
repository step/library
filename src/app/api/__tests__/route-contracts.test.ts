// @vitest-environment node
// Pins the exact response of every route branch: status, body and cache header. The app shows
// these messages to people (toasts, form errors), so wording and shape are part of the contract.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest, params } from "../../../../test/helpers/request";
import { ADMIN, MEMBER, sessionFor } from "../../../../test/helpers/identity";

const m = vi.hoisted(() => ({
    getServerSession: vi.fn(), getLoggedInUser: vi.fn(), getAllLibraryUsers: vi.fn(), addLibraryUser: vi.fn(),
    bulkAddLibraryUsers: vi.fn(), updateUserRole: vi.fn(), deleteLibraryUser: vi.fn(), getBorrowedBooks: vi.fn(),
    borrowBook: vi.fn(), returnBook: vi.fn(), onboardBook: vi.fn(), loadBooksWithSearch: vi.fn(),
    invalidateBooksCache: vi.fn(), findBook: vi.fn(), rows: [] as unknown[],
}));
vi.mock("next-auth", () => ({ getServerSession: m.getServerSession }));
vi.mock("@/app/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/app/lib/neon-local", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ neon: () => async () => m.rows }));
vi.mock("../../../../db/user", () => ({
    getLoggedInUser: m.getLoggedInUser, getAllLibraryUsers: m.getAllLibraryUsers, addLibraryUser: m.addLibraryUser,
    bulkAddLibraryUsers: m.bulkAddLibraryUsers, updateUserRole: m.updateUserRole, deleteLibraryUser: m.deleteLibraryUser,
}));
vi.mock("../../../../db/borrowedBooks", () => ({ getBorrowedBooks: m.getBorrowedBooks, borrowBook: m.borrowBook, returnBook: m.returnBook }));
vi.mock("../../../../db/books", () => ({ onboardBook: m.onboardBook }));
vi.mock("../../action", () => ({ loadBooksWithSearch: m.loadBooksWithSearch, invalidateBooksCache: m.invalidateBooksCache }));
vi.mock("../book/books-archeive", () => ({ findBook: m.findBook }));

import { GET as getBooks } from "../books/route";
import { POST as borrow } from "../books/borrow/route";
import { POST as booksReturn } from "../books/return/route";
import { POST as onBoard } from "../books/on-board/route";
import { GET as getReading } from "../reading/route";
import { POST as readingReturn } from "../reading/return/route";
import { GET as getBook } from "../book/route";
import { GET as listUsers, POST as addUser } from "../users/route";
import { POST as bulk } from "../users/bulk/route";
import { PATCH as patchUser, DELETE as deleteUser } from "../users/[id]/route";

const post = (url: string, body: unknown) => makeRequest(url, { method: "POST", body });
const expectJson = async (res: Response, status: number, body: unknown) => {
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual(body);
};
const UNAUTH_SESSION = { error: "Unauthorized - Please log in to access this resource" };

beforeEach(() => {
    for (const fn of Object.values(m)) if (typeof fn === "function") (fn as ReturnType<typeof vi.fn>).mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.rows = [];
    m.getServerSession.mockResolvedValue(sessionFor("member"));
    m.getLoggedInUser.mockResolvedValue(MEMBER);
    m.invalidateBooksCache.mockResolvedValue(undefined);
});

describe.each([
    ["POST /api/books/borrow", borrow, "/api/books/borrow", () => m.borrowBook, "Borrow failed", "Failed to borrow book", "Book borrowed successfully", (r: { message: string }) => r.message],
    ["POST /api/books/return", booksReturn, "/api/books/return", () => m.returnBook, "Return failed", "Failed to return book", "Book returned successfully", () => "Failed to return book - book may not be borrowed by this user"],
    ["POST /api/reading/return", readingReturn, "/api/reading/return", () => m.returnBook, "Return failed", "Failed to return book", "Book returned successfully", (r: { message: string }) => r.message],
])("%s", (_name, handler, url, fn, failError, serverMessage, okMessage, failMessage) => {
    it("400 when the barcode is missing", async () => {
        await expectJson(await handler(post(url, {})), 400, { error: "Validation failed", message: "Barcode is required" });
    });
    it.each([[5], ["   "], [{}], [[]]])("400 when the barcode is %j", async (barcode) => {
        await expectJson(await handler(post(url, { barcode })), 400, { error: "Validation failed", message: "Barcode must be a non-empty string" });
    });
    it("401 when not signed in as a library user", async () => {
        m.getLoggedInUser.mockResolvedValue(null);
        await expectJson(await handler(post(url, { barcode: "x" })), 401, { error: "Authentication required", message: "User not logged in" });
        expect(fn()).not.toHaveBeenCalled();
    });
    it("400 with the reason when the action fails", async () => {
        const result = { success: false, message: "Book copy not found" };
        fn().mockResolvedValue(result);
        await expectJson(await handler(post(url, { barcode: "x" })), 400, { error: failError, message: failMessage(result) });
        expect(m.invalidateBooksCache).not.toHaveBeenCalled();
    });
    it("200 with the trimmed barcode on success", async () => {
        fn().mockResolvedValue({ success: true, message: "ok" });
        const res = await handler(post(url, { barcode: "  qr-9  " }));
        await expectJson(res, 200, { message: okMessage, barcode: "qr-9" });
        expect(fn()).toHaveBeenCalledWith(MEMBER.id, "qr-9");
        expect(m.invalidateBooksCache).toHaveBeenCalledTimes(1);
    });
    it("500 with a generic message when something throws", async () => {
        fn().mockRejectedValue(new Error("secret detail"));
        await expectJson(await handler(post(url, { barcode: "x" })), 500, { error: "Internal Server Error", message: serverMessage });
    });
});

describe("GET /api/reading", () => {
    it("401 without a library user", async () => {
        m.getLoggedInUser.mockResolvedValue(null);
        await expectJson(await getReading(), 401, UNAUTH_SESSION);
        expect(m.getBorrowedBooks).not.toHaveBeenCalled();
    });
    it("200 with the list, never cached by shared caches", async () => {
        m.getBorrowedBooks.mockResolvedValue([{ id: 1, title: "Dune" }]);
        const res = await getReading();
        expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
        await expectJson(res, 200, [{ id: 1, title: "Dune" }]);
    });
    it("500 with a generic message", async () => {
        m.getBorrowedBooks.mockRejectedValue(new Error("x"));
        await expectJson(await getReading(), 500, { error: "Internal Server Error", message: "Failed to fetch borrowed books" });
    });
});

describe("GET /api/books", () => {
    const get = (qs = "") => getBooks(makeRequest(`/api/books${qs}`));
    it("401 without a session", async () => {
        m.getServerSession.mockResolvedValue(null);
        await expectJson(await get(), 401, UNAUTH_SESSION);
    });
    it("200 with the list and a five minute shared cache", async () => {
        m.loadBooksWithSearch.mockResolvedValue([{ id: 1 }]);
        const res = await get();
        expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
        await expectJson(res, 200, [{ id: 1 }]);
    });
    it.each(["0", "abc", "-1"])("400 for size=%s", async (size) => {
        await expectJson(await get(`?size=${size}`), 400, { error: "Size must be a positive number" });
    });
    it("400 for size over 100", async () => {
        await expectJson(await get("?size=101"), 400, { error: "Size cannot exceed 100 items" });
    });
    it("400 for a bad cursor", async () => {
        await expectJson(await get("?lastSeenId=abc"), 400, { error: "lastSeenId must be a whole number" });
    });
    it("500 with a generic message", async () => {
        m.loadBooksWithSearch.mockRejectedValue(new Error("x"));
        await expectJson(await get(), 500, { error: "Internal Server Error", message: "Failed to fetch books" });
    });
});

describe("GET /api/book", () => {
    const get = (barcode?: string) => getBook(makeRequest(`/api/book${barcode === undefined ? "" : `?barcode=${encodeURIComponent(barcode)}`}`));
    it("401 without a session", async () => {
        m.getServerSession.mockResolvedValue(null);
        await expectJson(await get("123"), 401, UNAUTH_SESSION);
    });
    it("400 when the barcode is missing", async () => {
        await expectJson(await get(), 400, { error: "Validation failed", message: "Barcode query parameter is required" });
    });
    it("400 when the barcode is blank", async () => {
        await expectJson(await get("   "), 400, { error: "Validation failed", message: "Barcode must be a non-empty string" });
    });
    it("200 from the local catalogue with a one hour shared cache", async () => {
        m.rows = [{ id: 3, title: "T", authors: "A", isbn10: "x", isbn13: "y" }];
        const res = await get("123");
        expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=3600, stale-while-revalidate=1800");
        await expectJson(res, 200, { id: 3, title: "T", authors: "A", isbn10: "x", isbn13: "y", borrowedCount: 0, count: 0 });
    });
    it("200 from the outside services, marked as not yet in the library (id -1)", async () => {
        m.findBook.mockResolvedValue({ title: "T", authors: "A", isbn10: "x", isbn13: "y" });
        await expectJson(await get("123"), 200, { id: -1, title: "T", authors: "A", isbn10: "x", isbn13: "y", borrowedCount: 0, count: 0 });
        expect(m.findBook).toHaveBeenCalledWith("123");
    });
    it("404 when nobody knows it", async () => {
        m.findBook.mockResolvedValue(undefined);
        await expectJson(await get("123"), 404, { error: "Not found", message: "Book not found" });
    });
    it("500 with a generic message on any other failure", async () => {
        m.findBook.mockRejectedValue(new Error("boom"));
        await expectJson(await get("123"), 500, { error: "Internal Server Error", message: "Failed to fetch book" });
    });
});

describe("POST /api/books/on-board", () => {
    const body = { title: "Dune", authors: "FH", isbn10: "0441172717", copies: ["c1"] };
    const FORBIDDEN = { error: "Forbidden Only administrators can onboard books", message: "Only administrators can onboard books" };
    it("403 for members and signed-out visitors", async () => {
        await expectJson(await onBoard(post("/api/books/on-board", body)), 403, FORBIDDEN);
        m.getLoggedInUser.mockResolvedValue(null);
        await expectJson(await onBoard(post("/api/books/on-board", body)), 403, FORBIDDEN);
    });
    it("403 when the layer below reports access denied", async () => {
        m.getLoggedInUser.mockResolvedValue(ADMIN);
        m.onboardBook.mockRejectedValue(new Error("Access denied: administrators only"));
        await expectJson(await onBoard(post("/api/books/on-board", body)), 403, FORBIDDEN);
    });
    it("400 for invalid JSON and for an invalid body", async () => {
        m.getLoggedInUser.mockResolvedValue(ADMIN);
        await expectJson(await onBoard(makeRequest("/api/books/on-board", { method: "POST", rawBody: "{" })), 400, { error: "Validation failed", message: "Request body must be valid JSON" });
        await expectJson(await onBoard(post("/api/books/on-board", { ...body, title: "" })), 400, { error: "Validation failed", message: "Title is required" });
    });
    it("200 on success", async () => {
        m.getLoggedInUser.mockResolvedValue(ADMIN);
        await expectJson(await onBoard(post("/api/books/on-board", body)), 200, { message: "Book onboarded successfully" });
    });
    it("500 with a generic message", async () => {
        m.getLoggedInUser.mockResolvedValue(ADMIN);
        m.onboardBook.mockRejectedValue(new Error("db"));
        await expectJson(await onBoard(post("/api/books/on-board", body)), 500, { error: "Internal Server Error", message: "Failed to onboard book" });
    });
});

describe("/api/users", () => {
    beforeEach(() => m.getLoggedInUser.mockResolvedValue(ADMIN));
    const FORBIDDEN = { error: "Forbidden" };
    const valid = { name: "N", email: "n@x.com", batchId: 1 };

    it("everything is 403 for a member", async () => {
        m.getLoggedInUser.mockResolvedValue(MEMBER);
        await expectJson(await listUsers(), 403, FORBIDDEN);
        await expectJson(await addUser(post("/api/users", valid)), 403, FORBIDDEN);
        await expectJson(await bulk(post("/api/users/bulk", { users: [valid] })), 403, FORBIDDEN);
        await expectJson(await patchUser(makeRequest("/api/users/5", { method: "PATCH", body: { isAdmin: true } }), params("5")), 403, FORBIDDEN);
        await expectJson(await deleteUser(makeRequest("/api/users/5", { method: "DELETE" }), params("5")), 403, FORBIDDEN);
    });
    it("GET: 200 list, 500 generic", async () => {
        m.getAllLibraryUsers.mockResolvedValue([{ id: 1 }]);
        await expectJson(await listUsers(), 200, [{ id: 1 }]);
        m.getAllLibraryUsers.mockRejectedValue(new Error("x"));
        await expectJson(await listUsers(), 500, { error: "Internal Server Error" });
    });
    it("POST: 201 with the user and a message", async () => {
        m.addLibraryUser.mockResolvedValue({ id: 9 });
        await expectJson(await addUser(post("/api/users", valid)), 201, { message: "User added successfully", user: { id: 9 } });
    });
    it("POST: 400 carries the validation message", async () => {
        await expectJson(await addUser(post("/api/users", { ...valid, name: "" })), 400, { error: "name is required" });
    });
    it("POST: 409 for a duplicate and 500 for anything else", async () => {
        m.addLibraryUser.mockRejectedValue(Object.assign(new Error("dup"), { code: "23505" }));
        await expectJson(await addUser(post("/api/users", valid)), 409, { error: "User with this email already exists" });
        m.addLibraryUser.mockRejectedValue(new Error("x"));
        await expectJson(await addUser(post("/api/users", valid)), 500, { error: "Internal Server Error" });
    });

    describe("bulk", () => {
        it("200 with counts and a readable message", async () => {
            m.bulkAddLibraryUsers.mockResolvedValue({ added: 2, skipped: 1, users: [{ id: 1 }] });
            await expectJson(await bulk(post("/api/users/bulk", { users: [valid] })), 200, {
                message: "2 user(s) added, 1 skipped (already exist)", added: 2, skipped: 1, users: [{ id: 1 }],
            });
        });
        it("400 for a missing list, a too-long list and a bad row", async () => {
            await expectJson(await bulk(post("/api/users/bulk", {})), 400, { error: "users array is required" });
            await expectJson(await bulk(post("/api/users/bulk", { users: Array(1001).fill(valid) })), 400, { error: "At most 1000 users can be imported at once" });
            await expectJson(await bulk(post("/api/users/bulk", { users: [valid, { ...valid, email: "bad" }] })), 400, { error: "Row 2: email is not a valid address" });
        });
        it("500 generic", async () => {
            m.bulkAddLibraryUsers.mockRejectedValue(new Error("x"));
            await expectJson(await bulk(post("/api/users/bulk", { users: [valid] })), 500, { error: "Internal Server Error" });
        });
    });

    describe("[id]", () => {
        const patch = (id: string, body: unknown) => patchUser(makeRequest(`/api/users/${id}`, { method: "PATCH", body }), params(id));
        const del = (id: string) => deleteUser(makeRequest(`/api/users/${id}`, { method: "DELETE" }), params(id));
        it("400 for a bad id", async () => {
            await expectJson(await patch("abc", { isAdmin: true }), 400, { error: "Invalid user id" });
            await expectJson(await del("abc"), 400, { error: "Invalid user id" });
        });
        it("400 for acting on yourself", async () => {
            await expectJson(await patch(String(ADMIN.id), { isAdmin: false }), 400, { error: "Cannot modify your own role" });
            await expectJson(await del(String(ADMIN.id)), 400, { error: "Cannot delete your own account" });
        });
        it("PATCH 200, 400 for a bad flag, 500 generic", async () => {
            await expectJson(await patch("5", { isAdmin: true }), 200, { message: "User role updated" });
            await expectJson(await patch("5", {}), 400, { error: "isAdmin must be true or false" });
            m.updateUserRole.mockRejectedValue(new Error("x"));
            await expectJson(await patch("5", { isAdmin: true }), 500, { error: "Internal Server Error" });
        });
        it("DELETE 200, 409 for history, 500 generic", async () => {
            await expectJson(await del("5"), 200, { message: "User deleted" });
            m.deleteLibraryUser.mockRejectedValue(Object.assign(new Error("fk"), { code: "23001" }));
            await expectJson(await del("5"), 409, { error: "User has borrowed books and cannot be deleted" });
            m.deleteLibraryUser.mockRejectedValue(new Error("x"));
            await expectJson(await del("5"), 500, { error: "Internal Server Error" });
        });
    });
});
