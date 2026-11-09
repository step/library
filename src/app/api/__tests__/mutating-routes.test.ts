// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "../../../../test/helpers/request";
import { ADMIN, MEMBER } from "../../../../test/helpers/identity";

const m = vi.hoisted(() => ({
    getLoggedInUser: vi.fn(),
    returnBook: vi.fn(),
    borrowBook: vi.fn(),
    onboardBook: vi.fn(),
    invalidateBooksCache: vi.fn(),
}));

vi.mock("../../../../db/user", () => ({ getLoggedInUser: m.getLoggedInUser }));
vi.mock("../../../../db/borrowedBooks", () => ({ returnBook: m.returnBook, borrowBook: m.borrowBook }));
vi.mock("../../../../db/books", () => ({ onboardBook: m.onboardBook }));
vi.mock("../../action", () => ({ invalidateBooksCache: m.invalidateBooksCache }));

import { POST as readingReturn } from "../reading/return/route";
import { POST as booksReturn } from "../books/return/route";
import { POST as borrow } from "../books/borrow/route";
import { POST as onBoard } from "../books/on-board/route";

const post = (url: string, body: unknown) => makeRequest(url, { method: "POST", body });
const json = async (res: Response) => res.json();

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.getLoggedInUser.mockResolvedValue(MEMBER);
    m.invalidateBooksCache.mockResolvedValue(undefined);
});

describe.each([
    ["/api/reading/return", readingReturn],
    ["/api/books/return", booksReturn],
])("POST %s", (url, handler) => {
    it("returns 400 with the reason when the return fails (regression: used to answer 200)", async () => {
        m.returnBook.mockResolvedValue({ success: false, message: "You have not borrowed this book" });
        const res = await handler(post(url, { barcode: "qr-1" }));
        expect(res.status).toBe(400);
        expect(JSON.stringify(await json(res))).toContain("not");
        expect(m.invalidateBooksCache).not.toHaveBeenCalled();
    });

    it("returns 200, trims the barcode and refreshes the books cache on success", async () => {
        m.returnBook.mockResolvedValue({ success: true, message: "Book returned successfully" });
        const res = await handler(post(url, { barcode: "  qr-1  " }));
        expect(res.status).toBe(200);
        expect(await json(res)).toMatchObject({ barcode: "qr-1" });
        expect(m.returnBook).toHaveBeenCalledWith(MEMBER.id, "qr-1");
        expect(m.invalidateBooksCache).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, null, "", "   ", 0, 5, {}, []])("rejects barcode %j with 400 before touching the database", async (barcode) => {
        const res = await handler(post(url, { barcode }));
        expect(res.status).toBe(400);
        expect(m.returnBook).not.toHaveBeenCalled();
        expect(m.getLoggedInUser).not.toHaveBeenCalled();
    });

    it("returns 500 without leaking details when the database layer throws", async () => {
        m.returnBook.mockRejectedValue(new Error("connection to 10.0.0.5 refused"));
        const res = await handler(post(url, { barcode: "qr-1" }));
        expect(res.status).toBe(500);
        expect(JSON.stringify(await json(res))).not.toContain("10.0.0.5");
    });

    it("returns 500 on malformed JSON rather than crashing", async () => {
        const res = await handler(makeRequest(url, { method: "POST", rawBody: "{nope" }));
        expect([400, 500]).toContain(res.status);
        expect(m.returnBook).not.toHaveBeenCalled();
    });
});

describe("POST /api/books/borrow", () => {
    it("does not refresh the cache when borrowing fails", async () => {
        m.borrowBook.mockResolvedValue({ success: false, message: "Book copy is already borrowed" });
        const res = await borrow(post("/api/books/borrow", { barcode: "qr-1" }));
        expect(res.status).toBe(400);
        expect((await json(res)).message).toBe("Book copy is already borrowed");
        expect(m.invalidateBooksCache).not.toHaveBeenCalled();
    });

    it("refreshes the cache once on success and trims the barcode", async () => {
        m.borrowBook.mockResolvedValue({ success: true, message: "ok" });
        const res = await borrow(post("/api/books/borrow", { barcode: " qr-1 " }));
        expect(res.status).toBe(200);
        expect(m.borrowBook).toHaveBeenCalledWith(MEMBER.id, "qr-1");
        expect(m.invalidateBooksCache).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, "", "  ", 7, {}])("rejects barcode %j", async (barcode) => {
        expect((await borrow(post("/api/books/borrow", { barcode }))).status).toBe(400);
        expect(m.borrowBook).not.toHaveBeenCalled();
    });
});

describe("POST /api/books/on-board (validation)", () => {
    const body = { title: "Dune", authors: "Frank Herbert", isbn10: "0441172717", copies: ["qr-1"] };

    beforeEach(() => m.getLoggedInUser.mockResolvedValue(ADMIN));

    it("passes the normalised body to onboardBook and refreshes the cache", async () => {
        const res = await onBoard(post("/api/books/on-board", { ...body, title: " Dune ", copies: ["qr-1", "qr-1"], extra: 1 }));
        expect(res.status).toBe(200);
        expect(m.onboardBook).toHaveBeenCalledWith({ title: "Dune", authors: "Frank Herbert", isbn10: "0441172717", copies: ["qr-1"] });
        expect(m.invalidateBooksCache).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["missing copies", { ...body, copies: undefined }],
        ["no ISBN", { ...body, isbn10: undefined }],
        ["bad ISBN", { ...body, isbn10: "12" }],
        ["blank title", { ...body, title: " " }],
        ["array body", [body]],
    ])("rejects %s with 400 and writes nothing (regression: copies undefined used to give 500)", async (_name, payload) => {
        const res = await onBoard(post("/api/books/on-board", payload));
        expect(res.status).toBe(400);
        expect(m.onboardBook).not.toHaveBeenCalled();
        expect(m.invalidateBooksCache).not.toHaveBeenCalled();
    });

    it("rejects malformed JSON with 400", async () => {
        const res = await onBoard(makeRequest("/api/books/on-board", { method: "POST", rawBody: "{oops" }));
        expect(res.status).toBe(400);
        expect(m.onboardBook).not.toHaveBeenCalled();
    });

    it("checks admin before parsing, so a non-admin learns nothing about validation", async () => {
        m.getLoggedInUser.mockResolvedValue(MEMBER);
        const res = await onBoard(post("/api/books/on-board", { nonsense: true }));
        expect(res.status).toBe(403);
    });

    it("returns 500 when the database layer throws", async () => {
        m.onboardBook.mockRejectedValue(new Error("boom"));
        const res = await onBoard(post("/api/books/on-board", body));
        expect(res.status).toBe(500);
        expect(m.invalidateBooksCache).not.toHaveBeenCalled();
    });
});
