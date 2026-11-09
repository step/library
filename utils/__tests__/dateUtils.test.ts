// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatShortDate, formatTimeSince, formatDuration } from "../dateUtils";

const NOW = new Date("2026-11-09T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const daysAgo = (d: number) => ago(d * DAY);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("formatShortDate", () => {
    it("formats as day, short month, year (en-GB)", () => {
        expect(formatShortDate("2026-10-12T12:00:00Z")).toBe("12 Oct 2026");
    });
    it.each([
        ["2026-01-01T12:00:00Z", "1 Jan 2026"],
        ["2026-12-31T12:00:00Z", "31 Dec 2026"],
        ["2028-02-29T12:00:00Z", "29 Feb 2028"],
        ["2026-03-05T12:00:00Z", "5 Mar 2026"],
    ])("%s -> %s", (iso, expected) => expect(formatShortDate(iso)).toBe(expected));

    it("has no leading zero on the day", () => {
        expect(formatShortDate("2026-04-03T12:00:00Z")).toBe("3 Apr 2026");
    });
    it("accepts a date with an offset and a date-only string", () => {
        expect(formatShortDate("2026-10-12T12:00:00+05:30")).toBe("12 Oct 2026");
        expect(formatShortDate("2026-10-12")).toMatch(/^1[12] Oct 2026$/); // date-only is UTC midnight, local day may differ
    });
    it("reports an invalid date as 'Invalid Date' instead of throwing", () => {
        expect(formatShortDate("not a date")).toBe("Invalid Date");
        expect(formatShortDate("")).toBe("Invalid Date");
    });
});

describe("formatTimeSince", () => {
    it.each([
        [0, "Today"],
        [60 * 1000, "Today"],
        [DAY - 1, "Today"],
        [DAY, "1 day ago"],
        [2 * DAY, "2 days ago"],
        [29 * DAY, "29 days ago"],
        [30 * DAY, "1 month ago"],
        [59 * DAY, "1 month ago"],
        [60 * DAY, "2 months ago"],
        [364 * DAY, "12 months ago"],
        [365 * DAY, "1 year ago"],
        [365 * DAY + 29 * DAY, "1 year ago"],
        [365 * DAY + 30 * DAY, "1 year 1 month ago"],
        [2 * 365 * DAY, "2 years ago"],
        [800 * DAY, "2 years 2 months ago"],
    ])("%i ms ago -> %s", (ms, expected) => {
        expect(formatTimeSince(ago(ms))).toBe(expected);
    });

    it("uses singular and plural correctly", () => {
        expect(formatTimeSince(daysAgo(1))).toBe("1 day ago");
        expect(formatTimeSince(daysAgo(2))).toBe("2 days ago");
        expect(formatTimeSince(daysAgo(30))).toBe("1 month ago");
        expect(formatTimeSince(daysAgo(90))).toBe("3 months ago");
        expect(formatTimeSince(daysAgo(365))).toBe("1 year ago");
        expect(formatTimeSince(daysAgo(365 * 3))).toBe("3 years ago");
        expect(formatTimeSince(daysAgo(365 + 60))).toBe("1 year 2 months ago");
    });
    it("treats a date in the future as Today", () => {
        expect(formatTimeSince(new Date(NOW.getTime() + 5 * DAY).toISOString())).toBe("Today");
    });
    it("gives an unhelpful but non-throwing answer for an invalid date", () => {
        expect(() => formatTimeSince("garbage")).not.toThrow();
    });
    it("moves on as the clock advances", () => {
        const borrowed = daysAgo(0);
        expect(formatTimeSince(borrowed)).toBe("Today");
        vi.setSystemTime(new Date(NOW.getTime() + 3 * DAY));
        expect(formatTimeSince(borrowed)).toBe("3 days ago");
    });
});

describe("formatDuration", () => {
    const from = "2026-01-01T12:00:00Z";
    const after = (ms: number) => new Date(new Date(from).getTime() + ms).toISOString();

    it.each([
        [0, "Same day"],
        [DAY - 1, "Same day"],
        [DAY, "1 day"],
        [14 * DAY, "14 days"],
        [29 * DAY, "29 days"],
        [30 * DAY, "1 month"],
        [75 * DAY, "2 months"],
        [364 * DAY, "12 months"],
        [365 * DAY, "1 year"],
        [395 * DAY, "1 year 1 month"],
        [730 * DAY, "2 years"],
    ])("%i ms -> %s", (ms, expected) => expect(formatDuration(from, after(ms))).toBe(expected));

    it("says Same day when the end is before the start", () => {
        expect(formatDuration(after(5 * DAY), from)).toBe("Same day");
    });
    it("does not depend on today's date", () => {
        vi.setSystemTime(new Date("2040-01-01T00:00:00Z"));
        expect(formatDuration(from, after(14 * DAY))).toBe("14 days");
    });
    it("does not throw on invalid input", () => {
        expect(() => formatDuration("x", "y")).not.toThrow();
    });
});

describe("time zones", () => {
    const original = process.env.TZ;
    afterEach(() => {
        if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    });

    it.each(["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland"])(
        "formatTimeSince and formatDuration give the same result in %s",
        (tz) => {
            process.env.TZ = tz;
            expect(formatTimeSince(daysAgo(45))).toBe("1 month ago");
            expect(formatDuration("2026-01-01T00:00:00Z", "2026-01-15T00:00:00Z")).toBe("14 days");
        },
    );

    it("formatShortDate shows the viewer's local day", () => {
        process.env.TZ = "Pacific/Auckland"; // UTC+13 in November
        expect(formatShortDate("2026-10-12T23:00:00Z")).toBe("13 Oct 2026");
        process.env.TZ = "America/Los_Angeles";
        expect(formatShortDate("2026-10-12T03:00:00Z")).toBe("11 Oct 2026");
    });
});
