import '@/app/lib/neon-local';
import { neon } from '@neondatabase/serverless';
import {
    ACTIVITY_RANGES, ActivityRange, IDLE_MONTHS, LOAN_AGE_BUCKETS, OVERDUE_DAYS, TopReadersQuery, rankByCount,
} from '../utils/insights';
import {
    ActivityPoint, BatchEngagement, HeadlineStats, IdleBook, LoanAgeBucket, OverdueLoan, TopReaders,
} from '../types/Insights';

// Read-only queries for the admin Insights page. Day, week and month boundaries are the
// database's (UTC on Neon). Callers check that the user is an admin.

const db = () => neon(`${process.env.DATABASE_URL}`);
const iso = (v: string | Date | null) => (v === null ? null : new Date(v).toISOString());

export const getHeadlineStats = async (overdueDays = OVERDUE_DAYS): Promise<HeadlineStats> => {
    const [row] = await db()`
        SELECT
            (SELECT count(*) FROM book_copies)::int AS copies,
            (SELECT count(*) FROM book_copies WHERE borrowed)::int AS copies_out,
            (SELECT count(*) FROM library_users)::int AS members,
            (SELECT count(DISTINCT user_id) FROM borrowed_books
                WHERE borrowed_at >= now() - interval '30 days')::int AS active_readers,
            (SELECT count(*) FROM borrowed_books
                WHERE returned_at IS NULL AND borrowed_at < now() - make_interval(days => ${overdueDays}::int))::int AS overdue,
            (SELECT count(*) FROM borrowed_books
                WHERE borrowed_at >= date_trunc('month', now()))::int AS this_month,
            (SELECT count(*) FROM borrowed_books
                WHERE borrowed_at >= date_trunc('month', now() - interval '1 month')
                  AND borrowed_at < now() - interval '1 month')::int AS same_time_last_month
    `;
    return {
        copies: row.copies,
        copiesOut: row.copies_out,
        members: row.members,
        activeReaders: row.active_readers,
        overdue: row.overdue,
        borrowsThisMonth: row.this_month,
        borrowsSameTimeLastMonth: row.same_time_last_month,
    };
};

/** Borrows and returns per week or month, oldest first, with empty periods as zero. */
export const getActivity = async (range: ActivityRange): Promise<ActivityPoint[]> => {
    const { unit, span } = ACTIVITY_RANGES[range];
    const rows = await db()`
        WITH periods AS (
            SELECT p AS start, p + ('1 ' || ${unit})::interval AS finish
            FROM generate_series(
                date_trunc(${unit}, now() - ${span}::interval),
                date_trunc(${unit}, now()),
                ('1 ' || ${unit})::interval
            ) AS p
        )
        SELECT p.start,
            (SELECT count(*) FROM borrowed_books WHERE borrowed_at >= p.start AND borrowed_at < p.finish)::int AS borrowed,
            (SELECT count(*) FROM borrowed_books WHERE returned_at >= p.start AND returned_at < p.finish)::int AS returned
        FROM periods p
        ORDER BY p.start
    `;
    const format: Intl.DateTimeFormatOptions = unit === 'week'
        ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
        : { month: 'short', timeZone: 'UTC' };
    return rows.map(r => ({
        label: new Date(r.start).toLocaleDateString('en-GB', format),
        borrowed: r.borrowed,
        returned: r.returned,
    }));
};

/** Copies out now, by how long they have been out. */
export const getLoanAge = async (overdueDays = OVERDUE_DAYS): Promise<LoanAgeBucket[]> => {
    const rows = await db()`
        SELECT floor(extract(epoch FROM now() - borrowed_at) / 86400)::int AS days
        FROM borrowed_books
        WHERE returned_at IS NULL
    `;
    const days: number[] = rows.map(r => r.days);
    return LOAN_AGE_BUCKETS.map(b => ({
        label: b.label,
        count: days.filter(d => d >= b.from && (b.to === null || d < b.to)).length,
        overdue: b.from >= overdueDays,
    }));
};

/** Loans out longer than the loan period, longest first. */
export const getOverdueLoans = async (overdueDays = OVERDUE_DAYS): Promise<OverdueLoan[]> => {
    const rows = await db()`
        SELECT bb.id, u.name, u.email, u.batch_id, b.title, b.authors, bb.borrowed_at,
            floor(extract(epoch FROM now() - bb.borrowed_at) / 86400)::int AS days_out
        FROM borrowed_books bb
        JOIN book_copies bc ON bc.id = bb.book_copy_id
        JOIN books b ON b.id = bc.book_id
        JOIN library_users u ON u.id = bb.user_id
        WHERE bb.returned_at IS NULL
          AND bb.borrowed_at < now() - make_interval(days => ${overdueDays}::int)
        ORDER BY bb.borrowed_at ASC, bb.id ASC
    `;
    return rows.map(r => ({
        id: r.id,
        readerName: r.name,
        readerEmail: r.email,
        batchId: r.batch_id,
        title: r.title,
        authors: r.authors,
        borrowedDate: iso(r.borrowed_at)!,
        daysOut: r.days_out,
    }));
};

/**
 * Books on the shelf that nobody has borrowed for a while: no loan in `months` months and no
 * copy out now (a copy out for ages is in use, just overdue). Most copies first.
 */
export const getIdleBooks = async (months = IDLE_MONTHS): Promise<IdleBook[]> => {
    const rows = await db()`
        SELECT b.id, b.title, b.authors, b.count AS copies, max(bb.borrowed_at) AS last_borrowed
        FROM books b
        JOIN book_copies bc ON bc.book_id = b.id
        LEFT JOIN borrowed_books bb ON bb.book_copy_id = bc.id
        GROUP BY b.id
        HAVING NOT bool_or(bc.borrowed)
           AND (max(bb.borrowed_at) IS NULL OR max(bb.borrowed_at) < now() - make_interval(months => ${months}::int))
        ORDER BY b.count DESC, max(bb.borrowed_at) ASC NULLS FIRST, b.title ASC
    `;
    return rows.map(r => ({
        id: r.id,
        title: r.title,
        authors: r.authors,
        copies: r.copies,
        lastBorrowed: iso(r.last_borrowed),
    }));
};

/** Who borrowed most between two days (both included). Ties share a rank. */
export const getTopReaders = async ({ from, to, limit }: TopReadersQuery): Promise<TopReaders> => {
    const rows = await db()`
        SELECT u.id, u.name, u.batch_id, count(*)::int AS borrows,
            EXISTS (SELECT 1 FROM borrowed_books o WHERE o.user_id = u.id AND o.returned_at IS NULL) AS reading_now
        FROM borrowed_books bb
        JOIN library_users u ON u.id = bb.user_id
        WHERE bb.borrowed_at >= ${from}::date AND bb.borrowed_at < ${to}::date + 1
        GROUP BY u.id
        ORDER BY borrows DESC, u.name ASC, u.id ASC
    `;
    const all = rows.map(r => ({ id: r.id, name: r.name, batchId: r.batch_id, count: r.borrows, readingNow: r.reading_now }));
    return {
        from,
        to,
        limit,
        readers: rankByCount(all).slice(0, limit),
        totalReaders: all.length,
        totalBorrows: all.reduce((sum, r) => sum + r.count, 0),
    };
};

/** Members per batch and how many of them have borrowed, newest batch first. */
export const getBatchEngagement = async (): Promise<BatchEngagement[]> => {
    const rows = await db()`
        SELECT u.batch_id,
            count(*)::int AS members,
            count(*) FILTER (WHERE l.loans > 0)::int AS borrowers,
            coalesce(sum(l.loans), 0)::int AS borrows,
            min(u.created_at) AS joined
        FROM library_users u
        LEFT JOIN (SELECT user_id, count(*) AS loans FROM borrowed_books GROUP BY user_id) l ON l.user_id = u.id
        GROUP BY u.batch_id
        ORDER BY u.batch_id DESC
    `;
    return rows.map(r => ({
        batchId: r.batch_id,
        members: r.members,
        borrowers: r.borrowers,
        borrows: r.borrows,
        joined: iso(r.joined),
    }));
};
