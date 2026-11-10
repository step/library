import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BorrowedBookWithUser } from "../../../../../types/BorrowedBook";

const action = vi.hoisted(() => ({ forceReturnBook: vi.fn() }));
vi.mock("../action", () => action);

import BorrowedBooks from "../BorrowedBooks";

const NOW = Date.parse("2026-11-09T12:00:00Z");
const loan = (id: number, over: Partial<BorrowedBookWithUser> = {}): BorrowedBookWithUser => ({
    id, title: `Book ${id}`, authors: `Author ${id}`, borrowedDate: new Date(NOW - 3 * 86400000).toISOString(),
    borrowerName: `Person ${id}`, borrowerEmail: `p${id}@x.com`, bookCopyId: id, qrCode: `qr-${id}`, ...over,
});
const LIST = [loan(1, { title: "Dune", authors: "Frank Herbert", borrowerName: "Mia Member", borrowerEmail: "mia@x.com" }), loan(2, { title: "Emma", authors: "Jane Austen", borrowerName: "Bob", borrowerEmail: "bob@x.com" })];

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const search = (text: string) => userEvent.type(screen.getByRole("searchbox", { name: /search borrowed books/i }), text);
const rows = () => screen.queryAllByRole("listitem");

describe("BorrowedBooks", () => {
    it("lists each loan with who has it and since when", () => {
        render(<BorrowedBooks borrowedBooks={LIST} />);
        const row = rows()[0];
        expect(within(row).getByText("Dune")).toBeInTheDocument();
        expect(within(row).getByText("Frank Herbert")).toBeInTheDocument();
        expect(within(row).getByText("Mia Member")).toBeInTheDocument();
        expect(within(row).getByText("6 Nov 2026")).toBeInTheDocument();
        expect(within(row).getByText("3 days ago")).toBeInTheDocument();
        expect(screen.getByText("2 books borrowed")).toBeInTheDocument();
    });

    it("counts one book in the singular", () => {
        render(<BorrowedBooks borrowedBooks={[LIST[0]]} />);
        expect(screen.getByText("1 book borrowed")).toBeInTheDocument();
    });

    it("says so when nothing is borrowed", () => {
        render(<BorrowedBooks borrowedBooks={[]} />);
        expect(screen.getByText("No books are currently borrowed")).toBeInTheDocument();
        expect(rows()).toHaveLength(0);
        expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
    });

    describe("search", () => {
        it.each([
            ["title", "dune", ["Dune"]],
            ["author", "austen", ["Emma"]],
            ["borrower name", "mia", ["Dune"]],
            ["borrower email", "bob@x", ["Emma"]],
            ["upper case", "DUNE", ["Dune"]],
            ["padding", "  dune  ", ["Dune"]],
            ["a shared letter", "e", ["Dune", "Emma"]],
        ])("matches by %s", async (_n, text, titles) => {
            render(<BorrowedBooks borrowedBooks={LIST} />);
            await search(text);
            expect(rows().map(r => within(r).getByText(/^(Dune|Emma)$/).textContent)).toEqual(titles);
        });

        it("shows 'x of y' while filtering", async () => {
            render(<BorrowedBooks borrowedBooks={LIST} />);
            await search("dune");
            expect(screen.getByText("1 of 2 borrowed")).toBeInTheDocument();
        });

        it("a search with no match shows a message and 'Clear search' restores everything", async () => {
            render(<BorrowedBooks borrowedBooks={LIST} />);
            await search("zzz");
            expect(screen.getByText("No borrowed books match your search")).toBeInTheDocument();
            expect(rows()).toHaveLength(0);
            await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
            expect(rows()).toHaveLength(2);
            expect(screen.getByRole("searchbox")).toHaveValue("");
        });

        it("treats regex characters as plain text", async () => {
            render(<BorrowedBooks borrowedBooks={LIST} />);
            await search(".*");
            expect(rows()).toHaveLength(0);
        });
    });

    describe("marking a book returned", () => {
        const markReturned = (title: string) => userEvent.click(screen.getByRole("button", { name: `Mark ${title} as returned` }));

        it("removes the row, updates the count and shows the server's message", async () => {
            action.forceReturnBook.mockResolvedValue({ success: true, message: "Book marked as returned successfully" });
            render(<BorrowedBooks borrowedBooks={LIST} />);
            await markReturned("Dune");
            expect(action.forceReturnBook).toHaveBeenCalledWith(1);
            expect(await screen.findByText("Book marked as returned successfully")).toBeInTheDocument();
            expect(screen.queryByText("Dune")).not.toBeInTheDocument();
            expect(screen.getByText("1 book borrowed")).toBeInTheDocument();
        });

        it("keeps the row and shows the reason when it fails", async () => {
            action.forceReturnBook.mockResolvedValue({ success: false, message: "Only administrators can return books for others" });
            render(<BorrowedBooks borrowedBooks={LIST} />);
            await markReturned("Dune");
            expect(await screen.findByText("Only administrators can return books for others")).toBeInTheDocument();
            expect(screen.getByText("Dune")).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Mark Dune as returned" })).toBeEnabled();
        });

        it("shows 'Updating...' and disables every button while one is in progress", async () => {
            let finish!: (v: unknown) => void;
            action.forceReturnBook.mockReturnValue(new Promise(r => { finish = r; }));
            render(<BorrowedBooks borrowedBooks={LIST} />);
            await markReturned("Dune");
            expect(screen.getByRole("button", { name: "Mark Dune as returned" })).toHaveTextContent("Updating...");
            expect(screen.getByRole("button", { name: "Mark Emma as returned" })).toBeDisabled();
            await act(async () => { finish({ success: true, message: "ok" }); });
            expect(screen.getByRole("button", { name: "Mark Emma as returned" })).toBeEnabled();
        });

        it("returns the right book when the list is filtered", async () => {
            action.forceReturnBook.mockResolvedValue({ success: true, message: "ok" });
            render(<BorrowedBooks borrowedBooks={LIST} />);
            await search("emma");
            await markReturned("Emma");
            expect(action.forceReturnBook).toHaveBeenCalledWith(2);
        });

        it("after the last book is returned, shows the empty message", async () => {
            action.forceReturnBook.mockResolvedValue({ success: true, message: "ok" });
            render(<BorrowedBooks borrowedBooks={[LIST[0]]} />);
            await markReturned("Dune");
            expect(await screen.findByText("No books are currently borrowed")).toBeInTheDocument();
        });
    });
});
