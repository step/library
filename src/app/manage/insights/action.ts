"use server";
import { getLoggedInUser } from '../../../../db/user';
import {
    getActivity, getBatchEngagement, getHeadlineStats, getIdleBooks, getLoanAge, getOverdueLoans, getTopReaders,
} from '../../../../db/insights';
import {
    DEFAULT_ACTIVITY_RANGE, defaultTopReadersQuery, isActivityRange, parseTopReadersQuery,
} from '../../../../utils/insights';
import {
    ActivityPoint, BatchEngagement, HeadlineStats, IdleBook, LoanAgeBucket, OverdueLoan, TopReaders,
} from '@/types/Insights';

// Server actions are callable directly over HTTP, so each one enforces admin access itself.
const requireAdmin = async () => {
    const user = await getLoggedInUser();
    if (!user || !user.isAdmin) {
        throw new Error('Access denied: administrators only');
    }
};

export type InsightsOverview = {
    headline: HeadlineStats;
    activity: ActivityPoint[];
    loanAge: LoanAgeBucket[];
    topReaders: TopReaders;
    idleBooks: IdleBook[];
    batches: BatchEngagement[];
};

/** Everything the Insights page shows on first load, fetched in parallel. */
export const getInsightsOverview = async (): Promise<InsightsOverview> => {
    await requireAdmin();
    const [headline, activity, loanAge, topReaders, idleBooks, batches] = await Promise.all([
        getHeadlineStats(),
        getActivity(DEFAULT_ACTIVITY_RANGE),
        getLoanAge(),
        getTopReaders(defaultTopReadersQuery()),
        getIdleBooks(),
        getBatchEngagement(),
    ]);
    return { headline, activity, loanAge, topReaders, idleBooks, batches };
};

export const fetchActivity = async (range: unknown): Promise<ActivityPoint[]> => {
    await requireAdmin();
    if (!isActivityRange(range)) throw new Error('Unknown period');
    return getActivity(range);
};

export const fetchTopReaders = async (query: unknown):
    Promise<{ ok: true; data: TopReaders } | { ok: false; message: string }> => {
    await requireAdmin();
    const parsed = parseTopReadersQuery(query);
    if (!parsed.ok) return parsed;
    return { ok: true, data: await getTopReaders(parsed.value) };
};

export const fetchOverdueLoans = async (): Promise<OverdueLoan[]> => {
    await requireAdmin();
    return getOverdueLoans();
};
