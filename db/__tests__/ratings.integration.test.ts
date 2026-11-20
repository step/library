import { describe, it, expect, vi } from "vitest";
import { q, insertBook, insertUser, openLoan, pgCode } from "../../test/integration/fixtures";

vi.mock("@/app/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} }));

import { saveRating, deleteRating } from "../ratings";
import { getBooks } from "../books";
import { getReturnedBooks, returnBook, borrowBook } from "../borrowedBooks";
import { loadBooksWithSearch } from "../../src/app/action";

/** A reader who has borrowed and returned a copy of a new book. */
const returnedReader = async (o: { copies?: number } = {}) => {
    const b = await insertBook({ copies: o.copies ?? 1 });
    const u = await insertUser();
    const loan = await openLoan(b.copyIds[0], u.id);
    await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [loan]);
    return { b, u };
};

const totals = async (bookId: number) => {
    const [r] = await q<{ rating_count: number; rating_sum: number }>(`SELECT rating_count, rating_sum FROM books WHERE id = $1`, [bookId]);
    return { count: r.rating_count, sum: r.rating_sum };
};

const ratingsOf = (bookId: number) =>
    q<{ user_id: number; rating: number }>(`SELECT user_id, rating FROM book_ratings WHERE book_id = $1 ORDER BY user_id`, [bookId]);

describe("saveRating: who may rate", () => {
    it("saves a rating for a reader who returned the book", async () => {
        const { b, u } = await returnedReader();
        expect(await saveRating(u.id, b.id, 4)).toBe("saved");
        expect(await ratingsOf(b.id)).toEqual([{ user_id: u.id, rating: 4 }]);
    });

    it("refuses a reader who has the book out but has not returned it", async () => {
        const b = await insertBook();
        const u = await insertUser();
        await openLoan(b.copyIds[0], u.id);
        expect(await saveRating(u.id, b.id, 4)).toBe("not-returned");
        expect(await ratingsOf(b.id)).toEqual([]);
    });

    it("refuses a reader who never borrowed the book", async () => {
        const b = await insertBook();
        const u = await insertUser();
        expect(await saveRating(u.id, b.id, 4)).toBe("not-returned");
    });

    it("does not count someone else's return", async () => {
        const { b } = await returnedReader();
        const other = await insertUser();
        expect(await saveRating(other.id, b.id, 5)).toBe("not-returned");
        expect(await ratingsOf(b.id)).toEqual([]);
    });

    it("counts a return of any copy of the book", async () => {
        const b = await insertBook({ copies: 3 });
        const u = await insertUser();
        const loan = await openLoan(b.copyIds[2], u.id);
        await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [loan]);
        expect(await saveRating(u.id, b.id, 3)).toBe("saved");
    });

    it("lets a reader rate a book they returned before, even while they have it out again", async () => {
        const { b, u } = await returnedReader({ copies: 2 });
        await openLoan(b.copyIds[1], u.id);
        expect(await saveRating(u.id, b.id, 2)).toBe("saved");
    });

    it("reports an unknown book as not found", async () => {
        const u = await insertUser();
        expect(await saveRating(u.id, 999, 4)).toBe("book-not-found");
    });

    it.each([0, 6, -1])("the database rejects a rating of %i", async (rating) => {
        const { b, u } = await returnedReader();
        expect(await pgCode(saveRating(u.id, b.id, rating))).toBe("23514");
        expect(await ratingsOf(b.id)).toEqual([]);
    });
});

describe("one rating per reader per book", () => {
    it("rating again replaces the earlier rating", async () => {
        const { b, u } = await returnedReader();
        await saveRating(u.id, b.id, 2);
        await saveRating(u.id, b.id, 5);
        expect(await ratingsOf(b.id)).toEqual([{ user_id: u.id, rating: 5 }]);
        expect(await totals(b.id)).toEqual({ count: 1, sum: 5 });
    });

    it("updates updated_at but keeps created_at on a re-rate", async () => {
        const { b, u } = await returnedReader();
        await saveRating(u.id, b.id, 2);
        await q(`UPDATE book_ratings SET created_at = '2026-01-01', updated_at = '2026-01-01'`);
        await saveRating(u.id, b.id, 3);
        const [r] = await q<{ created_at: Date; updated_at: Date }>(`SELECT created_at, updated_at FROM book_ratings`);
        expect(r.created_at.toISOString()).toBe("2026-01-01T00:00:00.000Z");
        expect(r.updated_at.getTime()).toBeGreaterThan(r.created_at.getTime());
    });

    it("a second loan of the same book shares the one rating in Past reads", async () => {
        const { b, u } = await returnedReader({ copies: 2 });
        const second = await openLoan(b.copyIds[1], u.id);
        await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [second]);
        await saveRating(u.id, b.id, 4);
        const list = await getReturnedBooks(u.id);
        expect(list).toHaveLength(2);
        expect(list.map(l => [l.bookId, l.rating])).toEqual([[b.id, 4], [b.id, 4]]);
    });

    it("Past reads shows null for an unrated book and only the reader's own rating", async () => {
        const { b, u } = await returnedReader({ copies: 2 });
        const other = await insertUser();
        const l = await openLoan(b.copyIds[1], other.id);
        await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [l]);
        await saveRating(other.id, b.id, 1);
        expect((await getReturnedBooks(u.id))[0].rating).toBeNull();
    });
});

describe("deleteRating", () => {
    it("removes the reader's rating and the totals follow", async () => {
        const { b, u } = await returnedReader();
        await saveRating(u.id, b.id, 4);
        await deleteRating(u.id, b.id);
        expect(await ratingsOf(b.id)).toEqual([]);
        expect(await totals(b.id)).toEqual({ count: 0, sum: 0 });
    });

    it("is not an error when there is nothing to remove", async () => {
        const { b, u } = await returnedReader();
        await expect(deleteRating(u.id, b.id)).resolves.toBeUndefined();
        expect(await totals(b.id)).toEqual({ count: 0, sum: 0 });
    });

    it("only removes the reader's own rating", async () => {
        const b = await insertBook({ copies: 2 });
        const [u1, u2] = [await insertUser(), await insertUser()];
        for (const [i, u] of [u1, u2].entries()) {
            const l = await openLoan(b.copyIds[i], u.id);
            await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [l]);
            await saveRating(u.id, b.id, 3 + i);
        }
        await deleteRating(u1.id, b.id);
        expect(await ratingsOf(b.id)).toEqual([{ user_id: u2.id, rating: 4 }]);
        expect(await totals(b.id)).toEqual({ count: 1, sum: 4 });
    });
});

describe("stored totals (sync_book_rating_totals trigger)", () => {
    const readers = async (bookId: number, copyIds: number[], ratings: number[]) => {
        for (const [i, rating] of ratings.entries()) {
            const u = await insertUser();
            const l = await openLoan(copyIds[i], u.id);
            await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [l]);
            await saveRating(u.id, bookId, rating);
        }
    };

    it("counts one rating per reader and sums them", async () => {
        const b = await insertBook({ copies: 3 });
        await readers(b.id, b.copyIds, [4, 4, 5]);
        expect(await totals(b.id)).toEqual({ count: 3, sum: 13 });
    });

    it("the catalogue shows the average to one decimal, as a number", async () => {
        const b = await insertBook({ copies: 3 });
        await readers(b.id, b.copyIds, [4, 4, 5]);
        const [book] = await getBooks("", 20);
        expect(book).toMatchObject({ ratingCount: 3, ratingAverage: 4.3 });
        expect(typeof book.ratingAverage).toBe("number");
        expect(typeof book.ratingCount).toBe("number");
    });

    it("rounds half up (4.25 -> 4.3, 4.15 -> 4.2)", async () => {
        const b = await insertBook();
        await q(`UPDATE books SET rating_count = 4, rating_sum = 17 WHERE id = $1`, [b.id]);
        expect((await getBooks("", 20))[0].ratingAverage).toBe(4.3);
        await q(`UPDATE books SET rating_count = 20, rating_sum = 83 WHERE id = $1`, [b.id]);
        expect((await getBooks("", 20))[0].ratingAverage).toBe(4.2);
    });

    it("an unrated book has a count of 0 and no average", async () => {
        await insertBook();
        expect((await getBooks("", 20))[0]).toMatchObject({ ratingCount: 0, ratingAverage: null });
        expect((await loadBooksWithSearch(""))[0]).toMatchObject({ ratingCount: 0, ratingAverage: null });
    });

    it("loadBooksWithSearch (first page, server side) carries the same average", async () => {
        const b = await insertBook({ copies: 2 });
        await readers(b.id, b.copyIds, [3, 4]);
        expect((await loadBooksWithSearch(""))[0]).toMatchObject({ ratingCount: 2, ratingAverage: 3.5 });
    });

    it("keeps each book's totals separate", async () => {
        const a = await insertBook();
        const c = await insertBook();
        await readers(a.id, a.copyIds, [5]);
        await readers(c.id, c.copyIds, [1]);
        expect(await totals(a.id)).toEqual({ count: 1, sum: 5 });
        expect(await totals(c.id)).toEqual({ count: 1, sum: 1 });
    });

    it("moves the totals when a rating is moved to another book", async () => {
        const { b, u } = await returnedReader();
        const other = await insertBook();
        await saveRating(u.id, b.id, 4);
        await q(`UPDATE book_ratings SET book_id = $1 WHERE book_id = $2`, [other.id, b.id]);
        expect(await totals(b.id)).toEqual({ count: 0, sum: 0 });
        expect(await totals(other.id)).toEqual({ count: 1, sum: 4 });
    });

    it("loses no rating when many readers rate the same book at once", async () => {
        const n = 8;
        const b = await insertBook({ copies: n });
        const users = [];
        for (let i = 0; i < n; i++) {
            const u = await insertUser();
            const l = await openLoan(b.copyIds[i], u.id);
            await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [l]);
            users.push(u);
        }
        const results = await Promise.all(users.map((u, i) => saveRating(u.id, b.id, (i % 5) + 1)));
        expect(results.every(r => r === "saved")).toBe(true);
        const expectedSum = users.reduce((s, _, i) => s + (i % 5) + 1, 0);
        expect(await totals(b.id)).toEqual({ count: n, sum: expectedSum });
    });

    it("TRUNCATE of book_ratings resets the totals", async () => {
        const { b, u } = await returnedReader();
        await saveRating(u.id, b.id, 5);
        await q(`TRUNCATE book_ratings`);
        expect(await totals(b.id)).toEqual({ count: 0, sum: 0 });
    });

    it("the books check rejects totals that cannot come from 1 to 5 star ratings", async () => {
        const b = await insertBook();
        expect(await pgCode(q(`UPDATE books SET rating_count = 1, rating_sum = 6 WHERE id = $1`, [b.id]))).toBe("23514");
        expect(await pgCode(q(`UPDATE books SET rating_count = -1, rating_sum = 0 WHERE id = $1`, [b.id]))).toBe("23514");
        expect(await pgCode(q(`UPDATE books SET rating_count = 0, rating_sum = 3 WHERE id = $1`, [b.id]))).toBe("23514");
    });
});

describe("deleting things that have ratings", () => {
    it("deleting a book removes its ratings", async () => {
        const { b, u } = await returnedReader();
        await saveRating(u.id, b.id, 4);
        await q(`DELETE FROM books WHERE id = $1`, [b.id]);
        expect(await q(`SELECT 1 FROM book_ratings`)).toHaveLength(0);
    });

    it("a reader with ratings still cannot be deleted while they have borrow history", async () => {
        const { b, u } = await returnedReader();
        await saveRating(u.id, b.id, 4);
        expect(await pgCode(q(`DELETE FROM library_users WHERE id = $1`, [u.id]))).toBe("23001"); // restrict_violation
        expect(await ratingsOf(b.id)).toHaveLength(1);
    });
});

describe("returnBook hands back the book for the rating prompt", () => {
    it("with the reader's earlier rating when they rated the book before", async () => {
        const { b, u } = await returnedReader({ copies: 2 });
        await saveRating(u.id, b.id, 3);
        await borrowBook(u.id, b.qrs[1]);
        const r = await returnBook(u.id, b.qrs[1]);
        expect(r.book).toEqual({ id: b.id, title: expect.any(String), authors: "Some Author", myRating: 3 });
    });

    it("with no rating when the reader has not rated it, ignoring other readers' ratings", async () => {
        const b = await insertBook({ copies: 2 });
        const [u, other] = [await insertUser(), await insertUser()];
        const l = await openLoan(b.copyIds[0], other.id);
        await q(`UPDATE borrowed_books SET returned_at = now() WHERE id = $1`, [l]);
        await saveRating(other.id, b.id, 5);
        await borrowBook(u.id, b.qrs[1]);
        expect((await returnBook(u.id, b.qrs[1])).book?.myRating).toBeNull();
    });

    it("after returning, the reader may rate the book", async () => {
        const b = await insertBook();
        const u = await insertUser();
        await borrowBook(u.id, b.qrs[0]);
        expect(await saveRating(u.id, b.id, 4)).toBe("not-returned");
        await returnBook(u.id, b.qrs[0]);
        expect(await saveRating(u.id, b.id, 4)).toBe("saved");
    });
});
