import { describe, it, expect } from "vitest";
import {
    ACTIVITY_RANGES, DEFAULT_TOP_READERS, LOAN_AGE_BUCKETS, OVERDUE_DAYS, TOP_READER_LIMITS,
    defaultTopReadersQuery, isActivityRange, isoDay, parseTopReadersQuery, percentChange, rankByCount,
} from "../insights";

describe("insights rules", () => {
    it("treats loans over 60 days as overdue, and the overdue loan-age groups start there", () => {
        expect(OVERDUE_DAYS).toBe(60);
        expect(LOAN_AGE_BUCKETS.find(b => b.from === OVERDUE_DAYS)).toBeDefined();
    });

    it("knows the three activity periods and nothing else", () => {
        expect(Object.keys(ACTIVITY_RANGES)).toEqual(["d30", "d90", "m12"]);
        expect(isActivityRange("d90")).toBe(true);
        for (const bad of ["toString", "d7", "", 30, null, undefined]) expect(isActivityRange(bad)).toBe(false);
    });

    it("defaults top readers to the last 90 days, top 10", () => {
        expect(DEFAULT_TOP_READERS).toBe(10);
        expect(defaultTopReadersQuery(new Date("2026-11-21T15:00:00Z"))).toEqual({ from: "2026-08-23", to: "2026-11-21", limit: 10 });
        expect(isoDay(new Date("2026-01-02T23:59:59Z"))).toBe("2026-01-02");
    });
});

describe("parseTopReadersQuery", () => {
    const ok = { from: "2026-08-23", to: "2026-11-21", limit: 10 };

    it("accepts whole days in order and a listed limit", () => {
        expect(parseTopReadersQuery(ok)).toEqual({ ok: true, value: ok });
        expect(parseTopReadersQuery({ ...ok, from: ok.to })).toMatchObject({ ok: true });
        for (const limit of TOP_READER_LIMITS) expect(parseTopReadersQuery({ ...ok, limit })).toMatchObject({ ok: true });
    });

    it("refuses a start after the end", () => {
        expect(parseTopReadersQuery({ ...ok, from: "2026-11-22" })).toEqual({ ok: false, message: "Start date must be on or before the end date" });
    });

    it("refuses anything that is not a real YYYY-MM-DD day", () => {
        for (const from of ["2026-02-30", "2026-13-01", "21/11/2026", "2026-1-1", "", 20260101, null, "2026-11-21T00:00:00Z"]) {
            expect(parseTopReadersQuery({ ...ok, from })).toEqual({ ok: false, message: "Enter dates as YYYY-MM-DD" });
        }
    });

    it("refuses limits outside the list, and non-objects", () => {
        for (const limit of [0, 3, 11, 100, "10", null]) expect(parseTopReadersQuery({ ...ok, limit })).toMatchObject({ ok: false });
        expect(parseTopReadersQuery(null)).toEqual({ ok: false, message: "Choose a period" });
        expect(parseTopReadersQuery("x")).toEqual({ ok: false, message: "Choose a period" });
    });
});

describe("rankByCount", () => {
    it("gives equal counts the same rank and skips ranks after a tie", () => {
        const ranked = rankByCount([{ count: 5 }, { count: 3 }, { count: 3 }, { count: 1 }]);
        expect(ranked.map(r => r.rank)).toEqual([1, 2, 2, 4]);
        expect(rankByCount([])).toEqual([]);
    });
});

describe("percentChange", () => {
    it("rounds the change and has nothing to say against zero", () => {
        expect(percentChange(112, 100)).toBe(12);
        expect(percentChange(90, 100)).toBe(-10);
        expect(percentChange(1, 3)).toBe(-67);
        expect(percentChange(5, 0)).toBeNull();
    });
});
