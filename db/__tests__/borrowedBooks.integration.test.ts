import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { q, insertBook, insertUser, bookCounts, copyBorrowed, openLoan, loansFor, recordTransactions, openTransactions, HUGE_ID } from "../../test/integration/fixtures";

vi.mock("@/app/lib/auth", () => ({ authOptions: {} }));

import {
    borrowBook, returnBook, getBorrowedBooks, getReturnedBooks, checkBookCopyAvailability,
} from "../borrowedBooks";
import { pool } from "../../src/app/lib/db";

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
const record = () => recordTransactions(pool, vi.spyOn as never);

describe("borrowBook", () => {
    it("borrows a free copy", async () => {
        const b = await insertBook({ title: "Dune" });
        const u = await insertUser();
        const r = await borrowBook(u.id, b.qrs[0]);
        expect(r).toMatchObject({ success: true, message: 'Successfully borrowed "Dune"' });
        expect(r.borrowedBookId).toBeTypeOf("number");
        expect(await copyBorrowed(b.qrs[0])).toBe(true);
        expect(await bookCounts(b.id)).toEqual({ count: 1, borrowed: 1 });
        const [loan] = await loansFor(b.copyIds[0]);
        expect(loan).toMatchObject({ id: r.borrowedBookId, user_id: u.id, returned_at: null });
    });

    it("records the borrow time", async () => {
        const b = await insertBook();
        const u = await insertUser();
        const before = Date.now();
        await borrowBook(u.id, b.qrs[0]);
        const [row] = await q<{ borrowed_at: Date }>(`SELECT borrowed_at FROM borrowed_books`);
        expect(Math.abs(row.borrowed_at.getTime() - before)).toBeLessThan(5000);
    });

    it("rejects an unknown QR code and changes nothing", async () => {
        const u = await insertUser();
        expect(await borrowBook(u.id, "nope")).toEqual({ success: false, message: "Book copy not found" });
        expect(await q(`SELECT 1 FROM borrowed_books`)).toHaveLength(0);
    });

    it.each([[" qr-pad "], ["QR-PAD"], ["qr-pad "], ["qr-"]])("treats %j as an unknown code (callers must trim; codes are case-sensitive)", async (code) => {
        await insertBook({ copies: ["qr-pad"] });
        const u = await insertUser();
        expect((await borrowBook(u.id, code)).success).toBe(false);
        expect(await q(`SELECT 1 FROM borrowed_books`)).toHaveLength(0);
    });

    it("rejects a copy that is already borrowed, even by the same user", async () => {
        const b = await insertBook();
        const u = await insertUser();
        await borrowBook(u.id, b.qrs[0]);
        expect(await borrowBook(u.id, b.qrs[0])).toEqual({ success: false, message: "Book copy is already borrowed" });
        expect(await loansFor(b.copyIds[0])).toHaveLength(1);
    });

    it("lets one person hold two copies of the same title", async () => {
        const b = await insertBook({ copies: 2 });
        const u = await insertUser();
        expect((await borrowBook(u.id, b.qrs[0])).success).toBe(true);
        expect((await borrowBook(u.id, b.qrs[1])).success).toBe(true);
        expect((await bookCounts(b.id)).borrowed).toBe(2);
    });

    it("fails cleanly and leaves the copy free when the user does not exist", async () => {
        const b = await insertBook();
        const r = await borrowBook(9999, b.qrs[0]);
        expect(r).toEqual({ success: false, message: "Failed to borrow book. Please try again." });
        expect(await copyBorrowed(b.qrs[0])).toBe(false);
        expect(await q(`SELECT 1 FROM borrowed_books`)).toHaveLength(0);
    });

    it("always gives the connection back, even on failure (pool does not run dry)", async () => {
        const b = await insertBook();
        for (let i = 0; i < 25; i++) await borrowBook(9999, b.qrs[0]);
        await borrowBook(9999, "nope");
        expect(pool.idleCount + pool.waitingCount).toBeGreaterThanOrEqual(0);
        expect(pool.totalCount - pool.idleCount).toBe(0); // nothing still checked out
        const u = await insertUser();
        expect((await borrowBook(u.id, b.qrs[0])).success).toBe(true);
    });

    describe("concurrency", () => {
        it("when many people borrow the same copy at once, exactly one wins", async () => {
            const b = await insertBook();
            const users = await Promise.all(Array.from({ length: 8 }, () => insertUser()));
            const results = await Promise.all(users.map(u => borrowBook(u.id, b.qrs[0])));
            expect(results.filter(r => r.success)).toHaveLength(1);
            expect(results.filter(r => !r.success).every(r => /already borrowed/.test(r.message))).toBe(true);
            const open = await q(`SELECT 1 FROM borrowed_books WHERE returned_at IS NULL`);
            expect(open).toHaveLength(1);
            expect(await bookCounts(b.id)).toEqual({ count: 1, borrowed: 1 });
        });

        it("when the same user double-taps, only one loan is created", async () => {
            const b = await insertBook();
            const u = await insertUser();
            const results = await Promise.all([borrowBook(u.id, b.qrs[0]), borrowBook(u.id, b.qrs[0])]);
            expect(results.filter(r => r.success)).toHaveLength(1);
            expect(await loansFor(b.copyIds[0])).toHaveLength(1);
        });

        it("different copies of the same book can be borrowed in parallel", async () => {
            const b = await insertBook({ copies: 6 });
            const users = await Promise.all(Array.from({ length: 6 }, () => insertUser()));
            const results = await Promise.all(users.map((u, i) => borrowBook(u.id, b.qrs[i])));
            expect(results.every(r => r.success)).toBe(true);
            expect(await bookCounts(b.id)).toEqual({ count: 6, borrowed: 6 });
        });
    });
});

describe("returnBook", () => {
    const borrowed = async () => {
        const b = await insertBook({ title: "Dune" });
        const u = await insertUser();
        await borrowBook(u.id, b.qrs[0]);
        return { b, u, qr: b.qrs[0], copyId: b.copyIds[0] };
    };

    it("returns a borrowed copy", async () => {
        const { b, u, qr, copyId } = await borrowed();
        expect(await returnBook(u.id, qr)).toEqual({ success: true, message: "Book returned successfully" });
        expect(await copyBorrowed(qr)).toBe(false);
        expect(await bookCounts(b.id)).toEqual({ count: 1, borrowed: 0 });
        const [loan] = await loansFor(copyId);
        expect(loan.returned_at).toBeInstanceOf(Date);
    });

    it("rejects an unknown code", async () => {
        const u = await insertUser();
        expect(await returnBook(u.id, "nope")).toEqual({ success: false, message: "Book copy not found" });
    });

    it("rejects a copy that is on the shelf", async () => {
        const b = await insertBook();
        const u = await insertUser();
        expect(await returnBook(u.id, b.qrs[0])).toEqual({ success: false, message: "Book copy is not borrowed" });
    });

    it("rejects a return by someone who does not hold the copy, and leaves the loan open", async () => {
        const { u, qr, copyId } = await borrowed();
        const other = await insertUser();
        expect(await returnBook(other.id, qr)).toEqual({ success: false, message: "You have not borrowed this book" });
        expect(await copyBorrowed(qr)).toBe(true);
        const [loan] = await loansFor(copyId);
        expect(loan).toMatchObject({ user_id: u.id, returned_at: null });
    });

    it("a second return of the same copy fails (regression guard for double returns)", async () => {
        const { u, qr, copyId } = await borrowed();
        expect((await returnBook(u.id, qr)).success).toBe(true);
        const [first] = await loansFor(copyId);
        expect((await returnBook(u.id, qr)).success).toBe(false);
        const [second] = await loansFor(copyId);
        expect(second.returned_at).toEqual(first.returned_at); // original return time is kept
    });

    it("concurrent returns by the same user succeed exactly once", async () => {
        const { u, qr } = await borrowed();
        const results = await Promise.all([1, 2, 3, 4].map(() => returnBook(u.id, qr)));
        expect(results.filter(r => r.success)).toHaveLength(1);
    });

    it("lets the next person borrow it right after a return, and only they can return it", async () => {
        const { u, qr } = await borrowed();
        const next = await insertUser();
        await returnBook(u.id, qr);
        expect((await borrowBook(next.id, qr)).success).toBe(true);
        expect((await returnBook(u.id, qr)).success).toBe(false); // old holder cannot return it now
        expect((await returnBook(next.id, qr)).success).toBe(true);
    });

    it("returns the right loan when a user has borrowed the same copy several times", async () => {
        const b = await insertBook();
        const u = await insertUser();
        for (let i = 0; i < 3; i++) {
            expect((await borrowBook(u.id, b.qrs[0])).success).toBe(true);
            expect((await returnBook(u.id, b.qrs[0])).success).toBe(true);
        }
        expect((await loansFor(b.copyIds[0])).every(l => l.returned_at !== null)).toBe(true);
        expect(await loansFor(b.copyIds[0])).toHaveLength(3);
    });

    it("does not touch other copies of the same book", async () => {
        const b = await insertBook({ copies: 2 });
        const [u1, u2] = [await insertUser(), await insertUser()];
        await borrowBook(u1.id, b.qrs[0]);
        await borrowBook(u2.id, b.qrs[1]);
        await returnBook(u1.id, b.qrs[0]);
        expect(await copyBorrowed(b.qrs[1])).toBe(true);
        expect(await bookCounts(b.id)).toEqual({ count: 2, borrowed: 1 });
    });
});

describe("getBorrowedBooks", () => {
    it("is empty for a user with no loans", async () => {
        const u = await insertUser();
        expect(await getBorrowedBooks(u.id)).toEqual([]);
    });

    it("lists only the user's own open loans, newest first", async () => {
        const [a, b, c] = [await insertBook({ title: "A" }), await insertBook({ title: "B" }), await insertBook({ title: "C" })];
        const [me, other] = [await insertUser(), await insertUser()];
        await openLoan(a.copyIds[0], me.id);
        await q(`UPDATE borrowed_books SET borrowed_at = now() - interval '2 days'`);
        await openLoan(b.copyIds[0], me.id);
        await openLoan(c.copyIds[0], other.id);

        const list = await getBorrowedBooks(me.id);
        expect(list.map(x => x.title)).toEqual(["B", "A"]);
        expect(list[0]).toMatchObject({ id: b.id, authors: "Some Author" });
        expect(new Date(list[0].borrowedDate).getTime()).not.toBeNaN();
    });

    it("excludes returned books", async () => {
        const b = await insertBook();
        const u = await insertUser();
        await borrowBook(u.id, b.qrs[0]);
        await returnBook(u.id, b.qrs[0]);
        expect(await getBorrowedBooks(u.id)).toEqual([]);
    });

    it("a user who unknown to the library gets nothing, not an error", async () => {
        expect(await getBorrowedBooks(424242)).toEqual([]);
    });
});

describe("getReturnedBooks", () => {
    it("lists returned loans, most recently returned first, as ISO strings", async () => {
        const [a, b] = [await insertBook({ title: "A" }), await insertBook({ title: "B" })];
        const u = await insertUser();
        const l1 = await openLoan(a.copyIds[0], u.id);
        const l2 = await openLoan(b.copyIds[0], u.id);
        await q(`UPDATE borrowed_books SET borrowed_at = '2026-01-01T10:00:00Z', returned_at = '2026-01-10T10:00:00Z' WHERE id = $1`, [l1]);
        await q(`UPDATE borrowed_books SET borrowed_at = '2026-02-01T10:00:00Z', returned_at = '2026-02-05T10:00:00Z' WHERE id = $1`, [l2]);

        const list = await getReturnedBooks(u.id);
        expect(list.map(x => x.title)).toEqual(["B", "A"]);
        expect(list[0]).toEqual({
            id: l2, title: "B", authors: "Some Author",
            borrowedDate: "2026-02-01T10:00:00.000Z", returnedDate: "2026-02-05T10:00:00.000Z",
        });
    });

    it("excludes open loans and other people's loans", async () => {
        const [a, b] = [await insertBook(), await insertBook()];
        const [me, other] = [await insertUser(), await insertUser()];
        await borrowBook(me.id, a.qrs[0]);                // still open
        await borrowBook(other.id, b.qrs[0]);
        await returnBook(other.id, b.qrs[0]);             // returned, but not mine
        expect(await getReturnedBooks(me.id)).toEqual([]);
    });

    it("lists the same title twice when it was read twice", async () => {
        const b = await insertBook({ title: "Dune" });
        const u = await insertUser();
        for (let i = 0; i < 2; i++) {
            await borrowBook(u.id, b.qrs[0]);
            await returnBook(u.id, b.qrs[0]);
        }
        expect((await getReturnedBooks(u.id)).map(x => x.title)).toEqual(["Dune", "Dune"]);
    });
});

describe("checkBookCopyAvailability", () => {
    it("is true for a free copy, false for a borrowed one, false for an unknown code", async () => {
        const b = await insertBook({ copies: 2 });
        const u = await insertUser();
        await borrowBook(u.id, b.qrs[0]);
        expect(await checkBookCopyAvailability(b.qrs[1])).toEqual({ available: true });
        expect(await checkBookCopyAvailability(b.qrs[0])).toEqual({ available: false });
        expect(await checkBookCopyAvailability("nope")).toEqual({ available: false });
    });

    it("is free again after the return", async () => {
        const b = await insertBook();
        const u = await insertUser();
        await borrowBook(u.id, b.qrs[0]);
        await returnBook(u.id, b.qrs[0]);
        expect(await checkBookCopyAvailability(b.qrs[0])).toEqual({ available: true });
    });

    it("treats a SQL-injection-looking code as just an unknown code", async () => {
        const b = await insertBook();
        expect(await checkBookCopyAvailability("x' OR '1'='1")).toEqual({ available: false });
        expect(await q(`SELECT 1 FROM book_copies`)).toHaveLength(b.qrs.length);
    });
});


describe("transactions", () => {
    describe("borrowBook", () => {
        it("runs as one transaction: BEGIN, lock the copy, insert, COMMIT", async () => {
            const b = await insertBook(); const u = await insertUser();
            const log = record();
            await borrowBook(u.id, b.qrs[0]);
            expect(log).toEqual(["BEGIN", "SELECT", "INSERT", "COMMIT"]);
            expect(await openTransactions()).toBe(0);
        });
        it("locks the copy row while checking it (FOR UPDATE)", async () => {
            const b = await insertBook(); const u = await insertUser();
            const seen: string[] = [];
            const real = pool.connect.bind(pool);
            vi.spyOn(pool, "connect").mockImplementation(async () => {
                const c = await real(); const orig = Object.getPrototypeOf(c).query.bind(c);
                c.query = (t: unknown, ...r: unknown[]) => { seen.push(String(t)); return orig(t, ...r); };
                return c;
            });
            await borrowBook(u.id, b.qrs[0]);
            expect(seen.find(t => /SELECT/i.test(t))).toMatch(/FOR UPDATE/);
        });
        it.each([["an unknown code", "nope"], ["a borrowed copy", "BORROWED"]])("rolls back for %s and leaves no transaction open", async (_n, code) => {
            const b = await insertBook(); const u = await insertUser();
            await borrowBook(u.id, b.qrs[0]);
            const log = record();
            await borrowBook(u.id, code === "BORROWED" ? b.qrs[0] : code);
            expect(log).toEqual(["BEGIN", "SELECT", "ROLLBACK"]);
            expect(await openTransactions()).toBe(0);
        });
        it("rolls back when the insert fails, and says so", async () => {
            const b = await insertBook();
            const log = record();
            expect(await borrowBook(HUGE_ID, b.qrs[0])).toEqual({ success: false, message: "Failed to borrow book. Please try again." });
            expect(log).toEqual(["BEGIN", "SELECT", "INSERT", "ROLLBACK"]);
            expect(await openTransactions()).toBe(0);
        });
    });

    describe("returnBook", () => {
        const borrowed = async () => { const b = await insertBook(); const u = await insertUser(); await borrowBook(u.id, b.qrs[0]); return { b, u }; };

        it("runs as one transaction: BEGIN, lock the copy, update, COMMIT", async () => {
            const { b, u } = await borrowed();
            const log = record();
            await returnBook(u.id, b.qrs[0]);
            expect(log).toEqual(["BEGIN", "SELECT", "UPDATE", "COMMIT"]);
            expect(await openTransactions()).toBe(0);
        });
        it("rolls back for an unknown code and for a copy on the shelf", async () => {
            const { b, u } = await borrowed();
            await returnBook(u.id, b.qrs[0]);
            for (const code of ["nope", b.qrs[0]]) {
                const log = record();
                await returnBook(u.id, code);
                expect(log).toEqual(["BEGIN", "SELECT", "ROLLBACK"]);
                vi.restoreAllMocks();
            }
            expect(await openTransactions()).toBe(0);
        });
        it("rolls back when the user does not hold the copy", async () => {
            const { b } = await borrowed();
            const other = await insertUser();
            const log = record();
            await returnBook(other.id, b.qrs[0]);
            expect(log).toEqual(["BEGIN", "SELECT", "UPDATE", "ROLLBACK"]);
            expect(await openTransactions()).toBe(0);
        });
        it("rolls back and reports failure when the update itself fails", async () => {
            const { b } = await borrowed();
            const log = record();
            expect(await returnBook(HUGE_ID, b.qrs[0])).toEqual({ success: false, message: "Failed to return book. Please try again." });
            expect(log).toEqual(["BEGIN", "SELECT", "UPDATE", "ROLLBACK"]);
            expect(await openTransactions()).toBe(0);
            expect(await copyBorrowed(b.qrs[0])).toBe(true);
        });
    });

    it("checkBookCopyAvailability answers 'not available' instead of throwing when the database is unreachable", async () => {
        const original = process.env.DATABASE_URL;
        process.env.DATABASE_URL = "postgres://nobody:none@127.0.0.1:1/none";
        try {
            expect(await checkBookCopyAvailability("qr-1")).toEqual({ available: false });
        } finally {
            process.env.DATABASE_URL = original;
        }
    });
});
