import { describe, it, expect, vi, beforeEach } from "vitest";
import { q, insertBook, insertUser, openLoan, bookCounts, copyBorrowed } from "../../../../../test/integration/fixtures";

const session = vi.hoisted(() => ({ current: null as unknown }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));
vi.mock("@/app/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/cache", () => ({
    revalidatePath: cache.revalidatePath,
    revalidateTag: cache.revalidateTag,
    unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
}));

import { forceReturnBook, getAllBorrowedBooks } from "../action";

const signedInAs = (email: string | null) => {
    session.current = email ? { user: { email, name: "x" } } : null;
};

beforeEach(() => {
    cache.revalidatePath.mockClear();
    cache.revalidateTag.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    signedInAs(null);
});

const setup = async () => {
    const admin = await insertUser({ email: "boss@x.com", isAdmin: true });
    const member = await insertUser({ email: "mia@x.com" });
    const book = await insertBook({ title: "Dune" });
    const loan = await openLoan(book.copyIds[0], member.id);
    return { admin, member, book, loan };
};

describe("getAllBorrowedBooks", () => {
    it("refuses anonymous callers and members", async () => {
        await setup();
        signedInAs(null);
        await expect(getAllBorrowedBooks()).rejects.toThrow(/Access denied/);
        signedInAs("mia@x.com");
        await expect(getAllBorrowedBooks()).rejects.toThrow(/Access denied/);
    });

    it("refuses a signed-in Google account that is not a library user", async () => {
        await setup();
        signedInAs("stranger@x.com");
        await expect(getAllBorrowedBooks()).rejects.toThrow(/Access denied/);
    });

    it("gives an admin every open loan with the borrower and QR code, newest first", async () => {
        const { member, book, loan } = await setup();
        const other = await insertBook({ title: "Emma" });
        await q(`UPDATE borrowed_books SET borrowed_at = now() - interval '3 days'`);
        const second = await openLoan(other.copyIds[0], member.id);
        signedInAs("boss@x.com");
        const rows = await getAllBorrowedBooks();
        expect(rows.map(r => r.title)).toEqual(["Emma", "Dune"]);
        expect(rows[1]).toMatchObject({
            id: loan, title: "Dune", authors: "Some Author", borrowerName: expect.stringMatching(/^User /),
            borrowerEmail: "mia@x.com", bookCopyId: book.copyIds[0], qrCode: book.qrs[0],
        });
        expect(rows[0].id).toBe(second);
    });

    it("leaves out returned loans", async () => {
        const { loan } = await setup();
        await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [loan]);
        signedInAs("boss@x.com");
        expect(await getAllBorrowedBooks()).toEqual([]);
    });
});

describe("forceReturnBook", () => {
    it("refuses anonymous callers and members, and changes nothing", async () => {
        const { book, loan } = await setup();
        for (const who of [null, "mia@x.com", "stranger@x.com"]) {
            signedInAs(who);
            expect(await forceReturnBook(loan)).toEqual({ success: false, message: "Only administrators can return books for others" });
        }
        expect(await copyBorrowed(book.qrs[0])).toBe(true);
        expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("lets an admin close the loan, which frees the copy and fixes the counts", async () => {
        const { book, loan } = await setup();
        signedInAs("boss@x.com");
        expect(await forceReturnBook(loan)).toEqual({ success: true, message: "Book marked as returned successfully" });
        expect(await copyBorrowed(book.qrs[0])).toBe(false);
        expect(await bookCounts(book.id)).toEqual({ count: 1, borrowed: 0 });
        expect((await q(`SELECT returned_at FROM borrowed_books`))[0].returned_at).toBeInstanceOf(Date);
    });

    it("refreshes the borrowed-books page and the books cache after success", async () => {
        const { loan } = await setup();
        signedInAs("boss@x.com");
        await forceReturnBook(loan);
        expect(cache.revalidatePath).toHaveBeenCalledWith("/manage/borrowed-books");
        expect(cache.revalidateTag).toHaveBeenCalledWith("books", "max");
    });

    it("reports failure for a loan that does not exist, and refreshes nothing", async () => {
        await setup();
        signedInAs("boss@x.com");
        const r = await forceReturnBook(999999);
        expect(r.success).toBe(false);
        expect(cache.revalidatePath).not.toHaveBeenCalled();
    });

    it("keeps the original return time when the loan was already returned", async () => {
        const { loan } = await setup();
        await q(`UPDATE borrowed_books SET returned_at = '2026-01-02T03:04:05Z' WHERE id = $1`, [loan]);
        signedInAs("boss@x.com");
        await forceReturnBook(loan);
        expect((await q(`SELECT returned_at FROM borrowed_books`))[0].returned_at.toISOString()).toBe("2026-01-02T03:04:05.000Z");
    });

    it("only closes the one loan", async () => {
        const { member, loan } = await setup();
        const other = await insertBook({ title: "Emma" });
        await openLoan(other.copyIds[0], member.id);
        signedInAs("boss@x.com");
        await forceReturnBook(loan);
        expect(await copyBorrowed(other.qrs[0])).toBe(true);
    });
});
