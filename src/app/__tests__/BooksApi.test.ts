import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ invalidateBooksCache: vi.fn() }));
vi.mock("../action", () => ({ invalidateBooksCache: m.invalidateBooksCache }));

import { borrowBook, returnBook, loadBooksAfter } from "../BooksApi";

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

describe.each([
    ["borrowBook", borrowBook, "/api/books/borrow", "Failed to borrow book. Please try again."],
    ["returnBook", returnBook, "/api/books/return", "Failed to return book. Please try again."],
])("%s", (_name, fn, url, failMessage) => {
    it("posts the barcode as JSON", async () => {
        fetchMock.mockResolvedValue(respond({ message: "ok" }));
        await fn("qr-1");
        expect(fetchMock).toHaveBeenCalledWith(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ barcode: "qr-1" }),
        });
    });

    it("on success returns the body and refreshes the books cache once", async () => {
        fetchMock.mockResolvedValue(respond({ message: "ok" }));
        expect(await fn("qr-1")).toEqual({ success: true, data: { message: "ok" } });
        expect(m.invalidateBooksCache).toHaveBeenCalledTimes(1);
    });

    it.each([400, 401, 403, 500])("on HTTP %i returns the server's message and does not refresh the cache", async (status) => {
        fetchMock.mockResolvedValue(respond({ message: "Book copy is already borrowed" }, status));
        expect(await fn("qr-1")).toEqual({ success: false, data: { message: "Book copy is already borrowed" } });
        expect(m.invalidateBooksCache).not.toHaveBeenCalled();
    });

    it("when the network fails returns a friendly message instead of throwing", async () => {
        fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
        expect(await fn("qr-1")).toEqual({ success: false, data: { message: failMessage } });
        expect(m.invalidateBooksCache).not.toHaveBeenCalled();
    });

    it("when the response is not JSON returns the friendly message", async () => {
        fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
        expect(await fn("qr-1")).toEqual({ success: false, data: { message: failMessage } });
    });
});

describe("loadBooksAfter", () => {
    it("requests the page with the cursor, size and encoded search", async () => {
        fetchMock.mockResolvedValue(respond([]));
        await loadBooksAfter("the hobbit & more", 42, 10);
        expect(fetchMock).toHaveBeenCalledWith("/api/books?lastSeenId=42&size=10&search=the%20hobbit%20%26%20more");
    });

    it("defaults to 20 per page", async () => {
        fetchMock.mockResolvedValue(respond([]));
        await loadBooksAfter("", 0);
        expect(fetchMock).toHaveBeenCalledWith("/api/books?lastSeenId=0&size=20&search=");
    });

    it("encodes characters that would break the URL (%, #, +, unicode)", async () => {
        fetchMock.mockResolvedValue(respond([]));
        await loadBooksAfter("100% C++ #1 三体", 0);
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain("search=100%25%20C%2B%2B%20%231%20");
        expect(url.split("search=")[1]).not.toMatch(/[ #+]/);
    });

    it("returns the books on success", async () => {
        fetchMock.mockResolvedValue(respond([{ id: 1 }]));
        expect(await loadBooksAfter("", 0)).toEqual({ success: true, data: [{ id: 1 }] });
    });

    it("reports failure for an error status", async () => {
        fetchMock.mockResolvedValue(respond({ error: "Unauthorized" }, 401));
        expect(await loadBooksAfter("", 0)).toEqual({ success: false, data: { error: "Unauthorized" } });
    });

    it("never throws: network errors become a friendly message", async () => {
        fetchMock.mockRejectedValue(new Error("offline"));
        expect(await loadBooksAfter("", 0)).toEqual({ success: false, data: { message: "Failed to load books. Please try again." } });
    });
});
