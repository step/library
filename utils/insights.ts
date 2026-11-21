/** Insights rules shared by the queries, the server actions and the page. */

/**
 * A loan out for longer than this many days counts as overdue. If it changes, keep one of the
 * LOAN_AGE_BUCKETS starting at it so the chart's overdue groups line up.
 */
export const OVERDUE_DAYS = 60;

/** A book with no loan in this many months (and no copy out now) counts as "nobody borrows". */
export const IDLE_MONTHS = 6;

export const ACTIVITY_RANGES = {
    d30: { label: "30 days", caption: "Per week, last 30 days", unit: "week", span: "4 weeks" },
    d90: { label: "90 days", caption: "Per week, last 90 days", unit: "week", span: "12 weeks" },
    m12: { label: "12 months", caption: "Per month, last 12 months", unit: "month", span: "11 months" },
} as const;
export type ActivityRange = keyof typeof ACTIVITY_RANGES;
export const DEFAULT_ACTIVITY_RANGE: ActivityRange = "d90";
export const isActivityRange = (v: unknown): v is ActivityRange =>
    typeof v === "string" && Object.prototype.hasOwnProperty.call(ACTIVITY_RANGES, v);

/** Copies out now, grouped by how long they have been out. `from`/`to` are days; `to` is exclusive. */
export const LOAN_AGE_BUCKETS = [
    { label: "Under 1 week", from: 0, to: 7 },
    { label: "1–2 weeks", from: 7, to: 14 },
    { label: "2 weeks–1 month", from: 14, to: 30 },
    { label: "1–2 months", from: 30, to: 60 },
    { label: "Over 2 months", from: 60, to: null },
] as const;

export const TOP_READER_LIMITS = [5, 10, 20, 50] as const;
export const DEFAULT_TOP_READERS = 10;
const DEFAULT_TOP_READER_DAYS = 90;

export type TopReadersQuery = { from: string; to: string; limit: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11-21" for a date, in UTC (the database's day boundaries). */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const isRealDay = (s: unknown): s is string => {
    if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    // Month 13 is no date at all; 30 February rolls over to March, so it fails the round trip.
    return !Number.isNaN(d.getTime()) && isoDay(d) === s;
};

/** The last 90 days up to and including `today`. */
export const defaultTopReadersQuery = (today = new Date()): TopReadersQuery => ({
    from: isoDay(new Date(today.getTime() - DEFAULT_TOP_READER_DAYS * 86_400_000)),
    to: isoDay(today),
    limit: DEFAULT_TOP_READERS,
});

/** Checks a top-readers request from the browser. Dates are whole days, both ends included. */
export const parseTopReadersQuery = (raw: unknown):
    { ok: true; value: TopReadersQuery } | { ok: false; message: string } => {
    if (typeof raw !== "object" || raw === null) return { ok: false, message: "Choose a period" };
    const { from, to, limit } = raw as Record<string, unknown>;
    if (!isRealDay(from) || !isRealDay(to)) return { ok: false, message: "Enter dates as YYYY-MM-DD" };
    if (from > to) return { ok: false, message: "Start date must be on or before the end date" };
    if (!TOP_READER_LIMITS.includes(limit as (typeof TOP_READER_LIMITS)[number])) {
        return { ok: false, message: `Show top ${TOP_READER_LIMITS.join(", ")}` };
    }
    return { ok: true, value: { from, to, limit: limit as number } };
};

/** Gives rows sorted by `count` (highest first) a rank; equal counts share one. */
export const rankByCount = <T extends { count: number }>(rows: T[]): (T & { rank: number })[] => {
    let rank = 0;
    let previous: number | null = null;
    return rows.map((row, i) => {
        if (row.count !== previous) {
            rank = i + 1;
            previous = row.count;
        }
        return { ...row, rank };
    });
};

/** Percentage change, rounded; null when there is nothing to compare against. */
export const percentChange = (now: number, before: number): number | null =>
    before === 0 ? null : Math.round(((now - before) / before) * 100);
