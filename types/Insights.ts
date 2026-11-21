/** Shapes the Insights page reads. Dates are ISO strings so they cross the server/client boundary as-is. */

export type HeadlineStats = {
    copies: number;
    copiesOut: number;
    members: number;
    /** Members who borrowed at least one book in the last 30 days. */
    activeReaders: number;
    overdue: number;
    borrowsThisMonth: number;
    /** Borrows from the start of last month to the same point in it, for a fair comparison. */
    borrowsSameTimeLastMonth: number;
};

export type ActivityPoint = { label: string; borrowed: number; returned: number };

export type LoanAgeBucket = { label: string; count: number; overdue: boolean };

export type OverdueLoan = {
    id: number;
    readerName: string;
    readerEmail: string;
    batchId: number;
    title: string;
    authors: string;
    borrowedDate: string;
    daysOut: number;
};

export type IdleBook = {
    id: number;
    title: string;
    authors: string;
    copies: number;
    /** null when no copy has ever been borrowed. */
    lastBorrowed: string | null;
};

export type TopReader = {
    id: number;
    name: string;
    batchId: number;
    count: number;
    rank: number;
    readingNow: boolean;
};

export type TopReaders = {
    from: string;
    to: string;
    limit: number;
    readers: TopReader[];
    /** Everyone who borrowed in the period, not just those shown. */
    totalReaders: number;
    totalBorrows: number;
};

export type BatchEngagement = {
    batchId: number;
    members: number;
    /** Members who have borrowed at least once. */
    borrowers: number;
    borrows: number;
    /** When the batch's first member was added. */
    joined: string | null;
};
