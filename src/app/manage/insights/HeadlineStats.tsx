import Link from "next/link";
import { HeadlineStats as Stats } from "@/types/Insights";
import { OVERDUE_DAYS, percentChange } from "@/utils/insights";

const share = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

const changeText = (now: number, before: number) => {
    const change = percentChange(now, before);
    if (change === null) return "Nothing to compare with last month yet";
    if (change === 0) return "Same as this time last month";
    return `${change > 0 ? "Up" : "Down"} ${Math.abs(change)}% on this time last month`;
};

/** The four numbers at the top of Insights. */
const HeadlineStats = ({ stats }: { stats: Stats }) => {
    const change = percentChange(stats.borrowsThisMonth, stats.borrowsSameTimeLastMonth);
    return (
        <section className="in-kpis" aria-label="Headline numbers">
            <div className="in-kpi">
                <span className="in-kpi-l">Copies out now</span>
                <span className="in-kpi-v">{stats.copiesOut}</span>
                <span className="in-kpi-s">{stats.copies - stats.copiesOut} of {stats.copies} copies on the shelf</span>
                <span className="in-meter" aria-hidden="true">
                    <span style={{ width: `${share(stats.copiesOut, stats.copies)}%` }} />
                </span>
            </div>
            <div className="in-kpi">
                <span className="in-kpi-l">Active readers</span>
                <span className="in-kpi-v">{stats.activeReaders}</span>
                <span className="in-kpi-s">
                    {share(stats.activeReaders, stats.members)}% of {stats.members} members borrowed in the last 30 days
                </span>
            </div>
            <div className="in-kpi">
                <span className="in-kpi-l">Overdue loans</span>
                <span className={`in-kpi-v ${stats.overdue > 0 ? "in-red" : ""}`}>{stats.overdue}</span>
                <span className="in-kpi-s">Out for more than {OVERDUE_DAYS} days</span>
                {stats.overdue > 0 && (
                    <Link href="/manage/insights/overdue" className="in-link">See who has them</Link>
                )}
            </div>
            <div className="in-kpi">
                <span className="in-kpi-l">Borrows this month</span>
                <span className="in-kpi-v">{stats.borrowsThisMonth}</span>
                <span className={`in-kpi-s ${change !== null && change > 0 ? "in-up" : ""}`}>
                    {changeText(stats.borrowsThisMonth, stats.borrowsSameTimeLastMonth)}
                </span>
            </div>
        </section>
    );
};

export default HeadlineStats;
