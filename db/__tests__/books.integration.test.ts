import { describe, it, expect, vi } from "vitest";
import { q, insertBook, insertUser, bookCounts, openLoan } from "../../test/integration/fixtures";

vi.mock("next/cache", () => ({
    revalidateTag: vi.fn(),
    revalidatePath: vi.fn(),
    unstable_cache: <T extends (...a: never[]) => unknown>(fn: T) => fn,
}));

import { getBooks, onboardBook } from "../books";
import { loadBooks, loadBooksWithSearch } from "../../src/app/action";

const titles = (books: { title: string }[]) => books.map(b => b.title);

const seed = async (names: string[]) => {
    for (const title of names) await insertBook({ title, copies: 1 });
};

describe("getBooks: browsing", () => {
    it("returns an empty list for an empty library", async () => {
        expect(await getBooks("", 20)).toEqual([]);
    });

    it("orders by id and honours the page size", async () => {
        await seed(["A", "B", "C", "D", "E"]);
        expect(titles(await getBooks("", 3))).toEqual(["A", "B", "C"]);
        expect(titles(await getBooks("", 100))).toHaveLength(5);
        expect(await getBooks("", 1)).toHaveLength(1);
    });

    it("maps every field, including borrowedCount", async () => {
        const b = await insertBook({ title: "Dune", isbn10: "0441172717", isbn13: "9780441172719", copies: 2 });
        const u = await insertUser();
        await openLoan(b.copyIds[0], u.id);
        expect(await getBooks("", 20)).toEqual([{
            id: b.id, title: "Dune", authors: "Some Author", isbn10: "0441172717", isbn13: "9780441172719", count: 2, borrowedCount: 1,
        }]);
    });

    it("treats a whitespace-only search as no search after the first page too (cursor)", async () => {
        await seed(["A", "B", "C"]);
        const first = await getBooks("", 1);
        expect(titles(await getBooks("   ", 20, String(first[0].id)))).toEqual(["B", "C"]);
        expect(titles(await loadBooksWithSearch("   ", String(first[0].id), 20))).toEqual(["B", "C"]);
    });

    it("treats a blank or whitespace-only search as no search", async () => {
        await seed(["A", "B"]);
        expect(await getBooks("   ", 20)).toHaveLength(2);
        expect(await getBooks("\t\n", 20)).toHaveLength(2);
    });
});

describe("getBooks: searching", () => {
    it("matches substrings, ignoring case", async () => {
        await seed(["The Hobbit", "Dune", "Dune Messiah", "Emma"]);
        expect(titles(await getBooks("dune", 20))).toEqual(["Dune", "Dune Messiah"]);
        expect(titles(await getBooks("DUNE", 20))).toEqual(["Dune", "Dune Messiah"]);
        expect(titles(await getBooks("hob", 20))).toEqual(["The Hobbit"]);
        expect(titles(await getBooks("bit", 20))).toEqual(["The Hobbit"]);
    });

    it("returns nothing when nothing matches", async () => {
        await seed(["Dune"]);
        expect(await getBooks("zzz", 20)).toEqual([]);
    });

    it("matches unicode titles", async () => {
        await seed(["Les Misérables", "Война и мир", "三体"]);
        expect(titles(await getBooks("misér", 20))).toEqual(["Les Misérables"]);
        expect(titles(await getBooks("мир", 20))).toEqual(["Война и мир"]);
        expect(titles(await getBooks("三", 20))).toEqual(["三体"]);
    });

    describe("wildcard characters are searched literally", () => {
        const names = ["100% Pure", "Plain", "snake_case", "snakeXcase", "back\\slash", "O'Reilly", 'He said "hi"'];

        it("% only matches a real percent sign", async () => {
            await seed(names);
            expect(titles(await getBooks("%", 20))).toEqual(["100% Pure"]);
        });
        it("_ only matches a real underscore", async () => {
            await seed(names);
            expect(titles(await getBooks("_", 20))).toEqual(["snake_case"]);
            expect(titles(await getBooks("snake_case", 20))).toEqual(["snake_case"]);
        });
        it("a backslash is just a character", async () => {
            await seed(names);
            expect(titles(await getBooks("\\", 20))).toEqual(["back\\slash"]);
        });
        it("quotes are safe", async () => {
            await seed(names);
            expect(titles(await getBooks("O'Re", 20))).toEqual(["O'Reilly"]);
            expect(titles(await getBooks('"hi"', 20))).toEqual(['He said "hi"']);
        });
        it("a search that looks like SQL is just text", async () => {
            await seed(names);
            expect(await getBooks("'; DROP TABLE books; --", 20)).toEqual([]);
            expect(await q(`SELECT 1 FROM books`)).toHaveLength(names.length);
        });
    });
});

describe("getBooks: cursor pagination", () => {
    it("pages through everything without gaps or overlaps", async () => {
        await seed(Array.from({ length: 23 }, (_, i) => `Book ${String(i).padStart(2, "0")}`));
        const seen: number[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 10; page++) {
            const rows = await getBooks("", 5, cursor);
            if (rows.length === 0) break;
            seen.push(...rows.map(r => r.id));
            cursor = String(rows[rows.length - 1].id);
        }
        expect(seen).toHaveLength(23);
        expect(new Set(seen).size).toBe(23);
        expect(seen).toEqual([...seen].sort((a, b) => a - b));
    });

    it("the last page is shorter and the one after is empty", async () => {
        await seed(["A", "B", "C", "D"]);
        const first = await getBooks("", 3);
        const second = await getBooks("", 3, String(first[2].id));
        expect(second).toHaveLength(1);
        expect(await getBooks("", 3, String(second[0].id))).toEqual([]);
    });

    it("a cursor past the end is empty", async () => {
        await seed(["A"]);
        expect(await getBooks("", 20, "9999")).toEqual([]);
    });

    it("pages within a search", async () => {
        await seed(["Dune 1", "Other", "Dune 2", "Dune 3", "Another"]);
        const first = await getBooks("dune", 2);
        expect(titles(first)).toEqual(["Dune 1", "Dune 2"]);
        const second = await getBooks("dune", 2, String(first[1].id));
        expect(titles(second)).toEqual(["Dune 3"]);
    });

    it("books added after the cursor appear on the next page; earlier ones do not shift it", async () => {
        await seed(["A", "B"]);
        const first = await getBooks("", 2);
        await seed(["C"]);
        expect(titles(await getBooks("", 2, String(first[1].id)))).toEqual(["C"]);
    });
});

describe("loadBooks and loadBooksWithSearch (server-side data for the pages)", () => {
    it("loadBooks returns the first 20 by id with camelCase fields", async () => {
        await seed(Array.from({ length: 25 }, (_, i) => `B${i}`));
        const books = await loadBooks();
        expect(books).toHaveLength(20);
        expect(Object.keys(books[0]).sort()).toEqual(["authors", "borrowedCount", "count", "id", "isbn10", "isbn13", "title"]);
    });

    it("loadBooksWithSearch gives the same answers as getBooks, including literal wildcards", async () => {
        await seed(["100% Pure", "Plain", "snake_case", "snakeXcase"]);
        expect(titles(await loadBooksWithSearch("%"))).toEqual(["100% Pure"]);
        expect(titles(await loadBooksWithSearch("_"))).toEqual(["snake_case"]);
        expect(titles(await loadBooksWithSearch(""))).toHaveLength(4);
        expect(titles(await loadBooksWithSearch("  "))).toHaveLength(4);
    });

    it("loadBooksWithSearch paginates with lastSeenId and size", async () => {
        await seed(["A", "B", "C", "D"]);
        const first = await loadBooksWithSearch("", undefined, 2);
        expect(titles(first)).toEqual(["A", "B"]);
        expect(titles(await loadBooksWithSearch("", String(first[1].id), 2))).toEqual(["C", "D"]);
    });
});

describe("onboardBook", () => {
    const base = { title: "Dune", authors: "Frank Herbert", isbn10: "0441172717", isbn13: "9780441172719" };

    it("creates the book and its copies", async () => {
        await onboardBook({ ...base, copies: ["qr-a", "qr-b"] });
        const [book] = await q<{ id: number; title: string; authors: string; isbn10: string; isbn13: string; count: number }>(`SELECT * FROM books`);
        expect(book).toMatchObject({ title: "Dune", authors: "Frank Herbert", isbn10: "0441172717", isbn13: "9780441172719", count: 2, borrowed_count: 0 });
        expect((await q(`SELECT qr_code FROM book_copies WHERE book_id=$1 ORDER BY id`, [book.id])).map(r => r.qr_code)).toEqual(["qr-a", "qr-b"]);
    });

    it("works with only an ISBN 10, or only an ISBN 13", async () => {
        await onboardBook({ title: "A", authors: "x", isbn10: "0000000001", copies: ["a1"] });
        await onboardBook({ title: "B", authors: "x", isbn13: "9780000000002", copies: ["b1"] });
        const rows = await q<{ title: string; isbn10: string | null; isbn13: string | null }>(`SELECT title, isbn10, isbn13 FROM books ORDER BY id`);
        expect(rows).toEqual([
            { title: "A", isbn10: "0000000001", isbn13: null },
            { title: "B", isbn10: null, isbn13: "9780000000002" },
        ]);
    });

    it("creates a book with no copies yet", async () => {
        await onboardBook({ ...base, copies: [] });
        expect((await q(`SELECT count FROM books`))[0].count).toBe(0);
    });

    it("adds copies to the existing book when the ISBN 10 matches (no duplicate book)", async () => {
        await onboardBook({ ...base, copies: ["c1"] });
        await onboardBook({ ...base, title: "Dune (reprint)", copies: ["c2", "c3"] });
        expect(await q(`SELECT 1 FROM books`)).toHaveLength(1);
        expect((await q(`SELECT title, count FROM books`))[0]).toEqual({ title: "Dune", count: 3 });
    });

    it("adds copies to the existing book when only the ISBN 13 matches", async () => {
        await onboardBook({ ...base, copies: ["c1"] });
        await onboardBook({ title: "Dune", authors: "FH", isbn13: base.isbn13, copies: ["c2"] });
        expect(await q(`SELECT 1 FROM books`)).toHaveLength(1);
        expect((await q(`SELECT count FROM books`))[0].count).toBe(2);
    });

    it("recognises a book when only the ISBN 10 matches and the request carries a different ISBN 13", async () => {
        await onboardBook({ ...base, copies: ["c1"] });
        await onboardBook({ ...base, isbn13: "9780000000002", copies: ["c2"] });
        expect(await q(`SELECT 1 FROM books`)).toHaveLength(1);
        expect((await q(`SELECT count, isbn13 FROM books`))[0]).toEqual({ count: 2, isbn13: "9780441172719" });
    });

    it("does not hide a real failure behind the duplicate-book retry", async () => {
        await expect(onboardBook({ ...base, title: null as unknown as string, copies: [] })).rejects.toMatchObject({ code: "23502" });
        expect(await q(`SELECT 1 FROM books`)).toHaveLength(0);
    });

    it("recognises a book when the new request has a different ISBN 10 but the same ISBN 13", async () => {
        await onboardBook({ ...base, copies: ["c1"] });
        await onboardBook({ ...base, isbn10: "0000000001", copies: ["c2"] });
        expect(await q(`SELECT 1 FROM books`)).toHaveLength(1);
        expect((await q(`SELECT count FROM books`))[0].count).toBe(2);
    });

    it("keeps one row per QR code when the list repeats a code", async () => {
        await onboardBook({ ...base, copies: ["dup", "dup", "other"] });
        expect((await q(`SELECT count FROM books`))[0].count).toBe(2);
    });

    it("is safe to run twice with the same copies (idempotent)", async () => {
        await onboardBook({ ...base, copies: ["c1", "c2"] });
        await onboardBook({ ...base, copies: ["c1", "c2"] });
        expect((await q(`SELECT count FROM books`))[0].count).toBe(2);
    });

    it("skips a QR code that already belongs to another book, without moving it or inflating counts", async () => {
        const other = await insertBook({ title: "Other", copies: ["taken"] });
        await onboardBook({ ...base, copies: ["taken", "fresh"] });
        const mine = (await q<{ id: number; count: number }>(`SELECT id, count FROM books WHERE title='Dune'`))[0];
        expect(mine.count).toBe(1);
        expect((await bookCounts(other.id)).count).toBe(1);
        expect((await q(`SELECT book_id FROM book_copies WHERE qr_code='taken'`))[0].book_id).toBe(other.id);
    });

    it("two admins adding the same new book at the same moment end up with one book and all copies", async () => {
        const results = await Promise.allSettled([
            onboardBook({ ...base, copies: ["p1", "p2"] }),
            onboardBook({ ...base, copies: ["p3"] }),
            onboardBook({ ...base, copies: ["p4"] }),
        ]);
        expect(results.map(r => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
        expect(await q(`SELECT 1 FROM books`)).toHaveLength(1);
        expect((await q(`SELECT count FROM books`))[0].count).toBe(4);
    });

    it("stores awkward titles exactly as given", async () => {
        const title = `Naïve "quotes" & 'apostrophes'; DROP TABLE books; -- 📚`;
        await onboardBook({ ...base, title, copies: [] });
        expect((await q(`SELECT title FROM books`))[0].title).toBe(title);
    });
});
