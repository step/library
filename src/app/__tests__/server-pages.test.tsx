// @vitest-environment node
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
    loadBooks: vi.fn(), loadReadingBooks: vi.fn(), loadReturnedBooks: vi.fn(),
    getLoggedInUser: vi.fn(), getBorrowedBooks: vi.fn(), getReturnedBooks: vi.fn(), getAllBorrowedBooks: vi.fn(),
}));
vi.mock("next/font/google", () => ({ Lexend: () => ({ className: "lx", variable: "--font-lexend" }) }));
vi.mock("../action", () => ({ loadBooks: m.loadBooks }));
vi.mock("../reading/action", () => ({ loadReadingBooks: m.loadReadingBooks }));
vi.mock("../history/action", () => ({ loadReturnedBooks: m.loadReturnedBooks }));
vi.mock("../manage/borrowed-books/action", () => ({ getAllBorrowedBooks: m.getAllBorrowedBooks }));
vi.mock("../../../components/Books", () => ({ default: function Books() { return null; } }));
vi.mock("@/components/ReadingBooks", () => ({ default: function ReadingBooks() { return null; } }));
vi.mock("@/components/PastReads", () => ({ default: function PastReads() { return null; } }));
vi.mock("../manage/borrowed-books/BorrowedBooks", () => ({ default: function BorrowedBooks() { return null; } }));
vi.mock("../manage/add-book/NewBookForm", () => ({ default: function NewBookForm() { return null; } }));
vi.mock("../manage/generate-qr-code/QrSheet", () => ({ default: function QrSheet() { return null; } }));
vi.mock("@/components/manage/BackLink", () => ({ default: function BackLink() { return null; } }));

import Home from "../page";
import ReadingPage from "../reading/page";
import HistoryPage from "../history/page";
import BorrowedBooksPage from "../manage/borrowed-books/page";
import AddBookPage from "../manage/add-book/page";
import GenerateQRCodePage from "../manage/generate-qr-code/page";

type El = React.ReactElement<Record<string, unknown> & { children?: React.ReactNode }>;
const names = (el: El): string[] => React.Children.toArray(el.props.children).map(c => (c as El).type && typeof (c as El).type === "function" ? ((c as El).type as { name: string }).name : String((c as El).type));
const child = (el: El, name: string) => React.Children.toArray(el.props.children).find(c => typeof (c as El).type === "function" && ((c as El).type as { name: string }).name === name) as El;

beforeEach(() => vi.clearAllMocks());

describe("server pages hand the loaded data to their component", () => {
    it("Home: the first page of books", async () => {
        m.loadBooks.mockResolvedValue([{ id: 1 }]);
        const el = (await Home()) as El;
        expect((el.type as { name: string }).name).toBe("Books");
        expect(el.props.books).toEqual([{ id: 1 }]);
    });
    it("Reading: the user's borrowed books", async () => {
        m.loadReadingBooks.mockResolvedValue([{ id: 2 }]);
        const el = (await ReadingPage()) as El;
        expect((el.type as { name: string }).name).toBe("ReadingBooks");
        expect(el.props.books).toEqual([{ id: 2 }]);
    });
    it("Past reads: the user's returned books", async () => {
        m.loadReturnedBooks.mockResolvedValue([{ id: 3 }]);
        const el = (await HistoryPage()) as El;
        expect((el.type as { name: string }).name).toBe("PastReads");
        expect(el.props.books).toEqual([{ id: 3 }]);
    });
    it("Borrowed books (admin): the list and a heading", async () => {
        m.getAllBorrowedBooks.mockResolvedValue([{ id: 4 }]);
        const el = (await BorrowedBooksPage()) as El;
        expect(child(el, "BorrowedBooks").props.borrowedBooks).toEqual([{ id: 4 }]);
        expect(JSON.stringify(el)).toContain("Borrowed books");
    });
    it("Borrowed books never renders when the admin check inside the data call refuses", async () => {
        m.getAllBorrowedBooks.mockRejectedValue(new Error("Access denied: administrators only"));
        await expect(BorrowedBooksPage()).rejects.toThrow("Access denied");
    });
    it("a failing loader fails the page instead of showing an empty list", async () => {
        m.loadBooks.mockRejectedValue(new Error("db down"));
        await expect(Home()).rejects.toThrow("db down");
    });
});

describe("static manage pages", () => {
    it("Add book: back link, heading and the form", () => {
        const el = AddBookPage() as El;
        expect(names(el)).toEqual(expect.arrayContaining(["BackLink", "h1", "p", "NewBookForm"]));
        expect(JSON.stringify(el)).toContain("Add a book");
    });
    it("QR codes: the heading block is hidden when printing, the sheet is not", () => {
        const el = GenerateQRCodePage() as El;
        const kids = React.Children.toArray(el.props.children) as El[];
        expect(kids[0].props.className).toBe("mg-noprint");
        expect((kids[1].type as { name: string }).name).toBe("QrSheet");
        expect(JSON.stringify(kids[0])).toContain("Generate QR codes");
    });
});
