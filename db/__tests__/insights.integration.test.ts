import { describe, it, expect } from "vitest";
import { q, insertBook, insertUser, openLoan } from "../../test/integration/fixtures";
import {
    getActivity, getBatchEngagement, getHeadlineStats, getIdleBooks, getLoanAge, getOverdueLoans, getTopReaders,
} from "../insights";
import { isoDay } from "../../utils/insights";

/** Moves a loan's dates: `borrowedDaysAgo`, and returned `returnedDaysAgo` (or still out). */
const age = (loanId: number, borrowedDaysAgo: number, returnedDaysAgo: number | null = null) =>
    q(`UPDATE borrowed_books
       SET borrowed_at = now() - make_interval(days => $2),
           returned_at = CASE WHEN $3::int IS NULL THEN NULL ELSE now() - make_interval(days => $3::int) END
       WHERE id = $1`, [loanId, borrowedDaysAgo, returnedDaysAgo]);

const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000));

describe("getHeadlineStats", () => {
    it("counts copies, members, active readers, overdue loans and this month's borrows", async () => {
        const a = await insertUser({ name: "Ann" });
        const b = await insertUser({ name: "Bob" });
        await insertUser({ name: "Cat" });
        const book = await insertBook({ copies: 4 });
        await openLoan(book.copyIds[0], a.id); // out today
        await age(await openLoan(book.copyIds[1], b.id), 61); // out 61 days: overdue
        await age(await openLoan(book.copyIds[2], b.id), 45, 35); // returned, outside 30 days
        await age(await openLoan(book.copyIds[3], b.id), 59); // out 59 days: not yet overdue

        const s = await getHeadlineStats();
        expect(s).toMatchObject({ copies: 4, copiesOut: 3, members: 3, activeReaders: 1, overdue: 1 });
        expect(s.borrowsThisMonth).toBeGreaterThanOrEqual(1);
    });

    it("compares this month with the same point last month, not all of it", async () => {
        const u = await insertUser();
        const book = await insertBook({ copies: 2 });
        // Exactly one month ago minus an hour: inside "same time last month".
        const inWindow = await openLoan(book.copyIds[0], u.id);
        await q(`UPDATE borrowed_books SET borrowed_at = now() - interval '1 month' - interval '1 hour', returned_at = now() - interval '1 month' WHERE id = $1`, [inWindow]);
        // One month ago plus an hour: later in last month than today is in this one, so left out.
        const outOfWindow = await openLoan(book.copyIds[1], u.id);
        await q(`UPDATE borrowed_books SET borrowed_at = now() - interval '1 month' + interval '1 hour', returned_at = now() WHERE id = $1`, [outOfWindow]);

        const s = await getHeadlineStats();
        const [{ same_month }] = await q<{ same_month: boolean }>(
            `SELECT date_trunc('month', now() - interval '1 month' - interval '1 hour') = date_trunc('month', now() - interval '1 month') AS same_month`);
        expect(s.borrowsSameTimeLastMonth).toBe(same_month ? 1 : 0);
    });
});

describe("getActivity", () => {
    it("returns 5 weeks for 30 days, 13 for 90 days and 12 months, zero-filled", async () => {
        expect(await getActivity("d30")).toHaveLength(5);
        expect(await getActivity("d90")).toHaveLength(13);
        const months = await getActivity("m12");
        expect(months).toHaveLength(12);
        expect(months.every(p => p.borrowed === 0 && p.returned === 0)).toBe(true);
    });

    it("puts a borrow and a return in the periods they happened", async () => {
        const u = await insertUser();
        const book = await insertBook();
        await age(await openLoan(book.copyIds[0], u.id), 20, 0);
        const weeks = await getActivity("d30");
        expect(weeks.reduce((s, p) => s + p.borrowed, 0)).toBe(1);
        expect(weeks[weeks.length - 1].returned).toBe(1);
        expect(weeks[0].label).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
        expect((await getActivity("m12"))[11].label).toMatch(/^[A-Z][a-z]{2}$/);
    });
});

describe("getLoanAge", () => {
    it("groups open loans by days out and marks the group past 60 days as overdue", async () => {
        const u = await insertUser();
        const book = await insertBook({ copies: 6 });
        const ages = [0, 6, 7, 20, 59, 60];
        for (const [i, d] of ages.entries()) await age(await openLoan(book.copyIds[i], u.id), d);
        const returned = await insertBook();
        await age(await openLoan(returned.copyIds[0], u.id), 90, 1); // returned: not counted

        const buckets = await getLoanAge();
        expect(buckets.map(b => [b.label, b.count, b.overdue])).toEqual([
            ["Under 1 week", 2, false],
            ["1–2 weeks", 1, false],
            ["2 weeks–1 month", 1, false],
            ["1–2 months", 1, false],
            ["Over 2 months", 1, true],
        ]);
    });
});

describe("getOverdueLoans", () => {
    it("lists loans out longer than the loan period, longest first, with the reader", async () => {
        const ann = await insertUser({ name: "Ann", email: "ann@x.com", batchId: 13 });
        const bob = await insertUser({ name: "Bob", email: "bob@x.com", batchId: 14 });
        const dune = await insertBook({ title: "Dune" });
        const emma = await insertBook({ title: "Emma" });
        const fresh = await insertBook({ title: "Fresh" });
        await age(await openLoan(dune.copyIds[0], ann.id), 61);
        await age(await openLoan(emma.copyIds[0], bob.id), 70);
        await age(await openLoan(fresh.copyIds[0], bob.id), 59);

        const rows = await getOverdueLoans();
        expect(rows.map(r => [r.title, r.readerName, r.readerEmail, r.batchId, r.daysOut])).toEqual([
            ["Emma", "Bob", "bob@x.com", 14, 70],
            ["Dune", "Ann", "ann@x.com", 13, 61],
        ]);
        expect(new Date(rows[0].borrowedDate).toISOString()).toBe(rows[0].borrowedDate);
    });
});

describe("getIdleBooks", () => {
    it("lists books with no loan in 6 months and no copy out, most copies first, never-borrowed before old", async () => {
        const u = await insertUser();
        const never = await insertBook({ title: "Never", copies: 2 });
        const old = await insertBook({ title: "Old", copies: 2 });
        const big = await insertBook({ title: "Big", copies: 9 });
        const recent = await insertBook({ title: "Recent" });
        const longOut = await insertBook({ title: "Long out" });
        await age(await openLoan(old.copyIds[0], u.id), 300, 290);
        await age(await openLoan(recent.copyIds[0], u.id), 20, 10);
        await age(await openLoan(longOut.copyIds[0], u.id), 300); // still out: in use, not idle

        const rows = await getIdleBooks(6);
        expect(rows.map(r => r.title)).toEqual(["Big", "Never", "Old"]);
        expect(rows.find(r => r.title === "Never")).toMatchObject({ copies: 2, lastBorrowed: null });
        expect(rows.find(r => r.title === "Old")!.lastBorrowed).not.toBeNull();
        expect(never.id).toBeGreaterThan(0);
        expect(big.copyIds).toHaveLength(9);
    });
});

describe("getTopReaders", () => {
    const setup = async () => {
        const ann = await insertUser({ name: "Ann", batchId: 13 });
        const bob = await insertUser({ name: "Bob", batchId: 14 });
        const cat = await insertUser({ name: "Cat", batchId: 15 });
        const book = await insertBook({ copies: 8 });
        let i = 0;
        const loan = async (userId: number, days: number, returned: number | null = 0) =>
            age(await openLoan(book.copyIds[i++], userId), days, returned);
        await loan(ann.id, 5); await loan(ann.id, 10); await loan(ann.id, 15);
        await loan(bob.id, 5); await loan(bob.id, 50);
        await loan(cat.id, 3, null); await loan(cat.id, 12);
        await loan(cat.id, 200); // outside every period below
        return { ann, bob, cat };
    };

    it("ranks readers by borrows in the period; ties share a rank and are listed by name", async () => {
        await setup();
        const r = await getTopReaders({ from: daysAgo(30), to: daysAgo(0), limit: 10 });
        expect(r.readers.map(x => [x.rank, x.name, x.count, x.batchId])).toEqual([
            [1, "Ann", 3, 13],
            [2, "Cat", 2, 15],
            [3, "Bob", 1, 14],
        ]);
        expect(r.readers.find(x => x.name === "Cat")!.readingNow).toBe(true);
        expect(r.readers.find(x => x.name === "Ann")!.readingNow).toBe(false);
        expect(r).toMatchObject({ totalReaders: 3, totalBorrows: 6 });
    });

    it("includes both end days, and applies the limit after counting everyone", async () => {
        await setup();
        const r = await getTopReaders({ from: daysAgo(60), to: daysAgo(5), limit: 1 });
        // Day 5 is the last day and counts: Ann 3 (days 5, 10, 15), Bob 2 (5, 50), Cat 1 (12; day 3 is after it).
        expect(r.readers).toHaveLength(1);
        expect(r.readers[0]).toMatchObject({ name: "Ann", count: 3, rank: 1 });
        expect(r.totalReaders).toBe(3);
        expect(r.totalBorrows).toBe(6);
    });

    it("returns nobody for a period with no loans", async () => {
        await setup();
        const r = await getTopReaders({ from: daysAgo(150), to: daysAgo(100), limit: 10 });
        expect(r).toMatchObject({ readers: [], totalReaders: 0, totalBorrows: 0 });
    });
});

describe("getBatchEngagement", () => {
    it("counts members, borrowers and borrows per batch, newest batch first", async () => {
        const a = await insertUser({ batchId: 14 });
        await insertUser({ batchId: 14 });
        const c = await insertUser({ batchId: 15 });
        await insertUser({ batchId: 15 });
        await insertUser({ batchId: 15 });
        const book = await insertBook({ copies: 3 });
        await age(await openLoan(book.copyIds[0], a.id), 10, 5);
        await age(await openLoan(book.copyIds[1], a.id), 4, 1);
        await openLoan(book.copyIds[2], c.id);

        const rows = await getBatchEngagement();
        expect(rows.map(r => [r.batchId, r.members, r.borrowers, r.borrows])).toEqual([
            [15, 3, 1, 1],
            [14, 2, 1, 2],
        ]);
        expect(rows[0].joined).not.toBeNull();
    });
});
