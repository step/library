import { describe, it, expect } from "vitest";
import {
    q, insertBook, insertUser, bookCounts, copyBorrowed, openLoan, pgCode, insertNextAuthUser,
} from "../../test/integration/fixtures";

describe("harness", () => {
    it("has every migration applied", async () => {
        const tables = (await q<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).map(t => t.table_name);
        for (const t of ["books", "book_copies", "borrowed_books", "library_users", "users", "accounts", "sessions", "verification_token", "books_db"]) {
            expect(tables).toContain(t);
        }
        const triggers = (await q<{ tgname: string }>(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`)).map(t => t.tgname);
        expect(triggers).toEqual(expect.arrayContaining(["trg_book_copies_sync_counts", "trg_borrowed_books_sync_flag"]));
        const [{ type }] = await q<{ type: string }>(`SELECT data_type AS type FROM information_schema.columns WHERE table_name='borrowed_books' AND column_name='borrowed_at'`);
        expect(type).toBe("timestamp with time zone");
    });

    it("starts every test with empty tables, ids restarted", async () => {
        expect((await insertBook()).id).toBe(1);
    });
    it("...and does not leak rows into the next test", async () => {
        expect(await q(`SELECT 1 FROM books`)).toHaveLength(0);
        expect(await q(`SELECT 1 FROM book_copies`)).toHaveLength(0);
    });
});

describe("books.count and borrowed_count (trigger on book_copies)", () => {
    it("counts copies as they are added", async () => {
        const b = await insertBook({ copies: 3 });
        expect(await bookCounts(b.id)).toEqual({ count: 3, borrowed: 0 });
    });

    it("is zero for a book without copies", async () => {
        const b = await insertBook({ copies: 0 });
        expect(await bookCounts(b.id)).toEqual({ count: 0, borrowed: 0 });
    });

    it("drops when a copy is deleted", async () => {
        const b = await insertBook({ copies: 3 });
        await q(`DELETE FROM book_copies WHERE id = $1`, [b.copyIds[0]]);
        expect((await bookCounts(b.id)).count).toBe(2);
    });

    it("moves with a copy that changes book", async () => {
        const a = await insertBook({ copies: 2 });
        const b = await insertBook({ copies: 1 });
        await q(`UPDATE book_copies SET book_id = $1 WHERE id = $2`, [b.id, a.copyIds[0]]);
        expect((await bookCounts(a.id)).count).toBe(1);
        expect((await bookCounts(b.id)).count).toBe(2);
    });

    it("cannot be edited into an inconsistent state by hand (check constraint)", async () => {
        const b = await insertBook({ copies: 1 });
        expect(await pgCode(q(`UPDATE books SET borrowed_count = 5 WHERE id = $1`, [b.id]))).toBe("23514");
        expect(await pgCode(q(`UPDATE books SET borrowed_count = -1 WHERE id = $1`, [b.id]))).toBe("23514");
    });
});

describe("book_copies.borrowed and borrowed_count (trigger on borrowed_books)", () => {
    it("a new loan flags the copy and counts it", async () => {
        const b = await insertBook({ copies: 2 });
        const u = await insertUser();
        await openLoan(b.copyIds[0], u.id);
        expect(await copyBorrowed(b.qrs[0])).toBe(true);
        expect(await copyBorrowed(b.qrs[1])).toBe(false);
        expect(await bookCounts(b.id)).toEqual({ count: 2, borrowed: 1 });
    });

    it("returning clears the flag and the count", async () => {
        const b = await insertBook();
        const u = await insertUser();
        const loan = await openLoan(b.copyIds[0], u.id);
        await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [loan]);
        expect(await copyBorrowed(b.qrs[0])).toBe(false);
        expect((await bookCounts(b.id)).borrowed).toBe(0);
    });

    it("deleting an open loan frees the copy", async () => {
        const b = await insertBook();
        const u = await insertUser();
        const loan = await openLoan(b.copyIds[0], u.id);
        await q(`DELETE FROM borrowed_books WHERE id = $1`, [loan]);
        expect(await copyBorrowed(b.qrs[0])).toBe(false);
    });

    it("re-opening a returned loan flags the copy again", async () => {
        const b = await insertBook();
        const u = await insertUser();
        const loan = await openLoan(b.copyIds[0], u.id);
        await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [loan]);
        await q(`UPDATE borrowed_books SET returned_at = NULL WHERE id = $1`, [loan]);
        expect(await copyBorrowed(b.qrs[0])).toBe(true);
    });

    it("keeps counts right with several copies borrowed by different people", async () => {
        const b = await insertBook({ copies: 3 });
        const [u1, u2] = [await insertUser(), await insertUser()];
        await openLoan(b.copyIds[0], u1.id);
        await openLoan(b.copyIds[1], u2.id);
        expect(await bookCounts(b.id)).toEqual({ count: 3, borrowed: 2 });
    });

    it("refuses a second open loan for the same copy (unique partial index)", async () => {
        const b = await insertBook();
        const [u1, u2] = [await insertUser(), await insertUser()];
        await openLoan(b.copyIds[0], u1.id);
        expect(await pgCode(openLoan(b.copyIds[0], u2.id))).toBe("23505");
    });

    it("allows borrowing again once it has been returned, keeping history", async () => {
        const b = await insertBook();
        const [u1, u2] = [await insertUser(), await insertUser()];
        const first = await openLoan(b.copyIds[0], u1.id);
        await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [first]);
        await openLoan(b.copyIds[0], u2.id);
        expect(await q(`SELECT 1 FROM borrowed_books WHERE book_copy_id = $1`, [b.copyIds[0]])).toHaveLength(2);
        expect(await copyBorrowed(b.qrs[0])).toBe(true);
    });
});

describe("constraints", () => {
    it("a book needs at least one ISBN", async () => {
        expect(await pgCode(q(`INSERT INTO books (title, authors) VALUES ('t','a')`))).toBe("23514");
    });
    it.each(["isbn10", "isbn13"])("%s is unique", async (col) => {
        const v = col === "isbn10" ? "0000000001" : "9780000000001";
        await q(`INSERT INTO books (title, authors, ${col}) VALUES ('a','a',$1)`, [v]);
        expect(await pgCode(q(`INSERT INTO books (title, authors, ${col}) VALUES ('b','b',$1)`, [v]))).toBe("23505");
    });
    it("a QR code belongs to one copy only", async () => {
        const a = await insertBook({ copies: ["same"] });
        const b = await insertBook({ copies: 0 });
        expect(a.qrs).toEqual(["same"]);
        expect(await pgCode(q(`INSERT INTO book_copies (book_id, qr_code) VALUES ($1,'same')`, [b.id]))).toBe("23505");
    });
    it("titles are not limited to 255 characters", async () => {
        const long = "x".repeat(2000);
        const b = await insertBook({ title: long });
        const [row] = await q<{ title: string }>(`SELECT title FROM books WHERE id=$1`, [b.id]);
        expect(row.title).toHaveLength(2000);
    });
    it("library user emails are unique", async () => {
        await insertUser({ email: "a@x.com" });
        expect(await pgCode(insertUser({ email: "a@x.com" }))).toBe("23505");
    });
    it("batch_id and name are required", async () => {
        expect(await pgCode(q(`INSERT INTO library_users (name, email) VALUES ('n','n@x.com')`))).toBe("23502");
        expect(await pgCode(q(`INSERT INTO library_users (email, batch_id) VALUES ('n@x.com', 1)`))).toBe("23502");
    });
    it("a loan must belong to a real library user and a real copy", async () => {
        const b = await insertBook();
        expect(await pgCode(openLoan(b.copyIds[0], 999))).toBe("23503");
        const u = await insertUser();
        expect(await pgCode(openLoan(999, u.id))).toBe("23503");
    });
    it("a library user with borrow history cannot be deleted", async () => {
        const b = await insertBook();
        const u = await insertUser();
        await openLoan(b.copyIds[0], u.id);
        // ON DELETE RESTRICT reports 23001 (not 23503): callers must handle both.
        expect(await pgCode(q(`DELETE FROM library_users WHERE id=$1`, [u.id]))).toBe("23001");
    });
    it("deleting a book removes its copies and their loans", async () => {
        const b = await insertBook({ copies: 2 });
        const u = await insertUser();
        await openLoan(b.copyIds[0], u.id);
        await q(`DELETE FROM books WHERE id=$1`, [b.id]);
        expect(await q(`SELECT 1 FROM book_copies`)).toHaveLength(0);
        expect(await q(`SELECT 1 FROM borrowed_books`)).toHaveLength(0);
    });
});

describe("NextAuth tables", () => {
    it("deleting the NextAuth user removes its accounts and sessions", async () => {
        const id = await insertNextAuthUser("a@x.com");
        await q(`DELETE FROM users WHERE id=$1`, [id]);
        expect(await q(`SELECT 1 FROM accounts`)).toHaveLength(0);
        expect(await q(`SELECT 1 FROM sessions`)).toHaveLength(0);
    });
    it("rejects an account or session for a missing user", async () => {
        expect(await pgCode(q(`INSERT INTO sessions ("userId", expires, "sessionToken") VALUES (99, now(), 't')`))).toBe("23503");
        expect(await pgCode(q(`INSERT INTO accounts ("userId", type, provider, "providerAccountId") VALUES (99,'oauth','google','x')`))).toBe("23503");
    });
    it("session tokens and provider accounts are unique, as are NextAuth emails", async () => {
        const id = await insertNextAuthUser("a@x.com");
        expect(await pgCode(q(`INSERT INTO sessions ("userId", expires, "sessionToken") VALUES ($1, now(), 'tok-a@x.com')`, [id]))).toBe("23505");
        expect(await pgCode(q(`INSERT INTO accounts ("userId", type, provider, "providerAccountId") VALUES ($1,'oauth','google','g-a@x.com')`, [id]))).toBe("23505");
        expect(await pgCode(q(`INSERT INTO users (name, email) VALUES ('x','a@x.com')`))).toBe("23505");
    });
});
