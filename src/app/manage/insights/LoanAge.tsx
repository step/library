import Link from "next/link";
import { LoanAgeBucket } from "@/types/Insights";
import { OVERDUE_DAYS } from "@/utils/insights";

/** Copies out now, by how long they have been out, as labelled bars. */
const LoanAge = ({ buckets, overdue }: { buckets: LoanAgeBucket[]; overdue: number }) => {
    const total = buckets.reduce((s, b) => s + b.count, 0);
    const max = Math.max(1, ...buckets.map(b => b.count));
    return (
        <section className="in-card" aria-labelledby="in-age-h">
            <div>
                <h2 className="in-h2" id="in-age-h">How long books have been out</h2>
                <p className="in-desc">
                    {total === 1 ? "The 1 copy" : `The ${total} copies`} out now, by time since they were borrowed
                </p>
            </div>
            <ul className="in-bars">
                {buckets.map(b => (
                    <li key={b.label} className={b.overdue ? "is-overdue" : undefined}>
                        <span className="in-bars-l">
                            {b.label}
                            {b.overdue && <span className="mg-sr"> (overdue)</span>}
                        </span>
                        <span className="in-bars-track" aria-hidden="true">
                            <span style={{ width: `${(b.count / max) * 100}%` }} />
                        </span>
                        <span className="in-bars-n">{b.count}</span>
                    </li>
                ))}
            </ul>
            <div className="in-card-foot">
                {overdue > 0 ? (
                    <>
                        <span><strong className="in-red">{overdue} {overdue === 1 ? "loan is" : "loans are"}</strong> past the {OVERDUE_DAYS}-day loan period</span>
                        <Link href="/manage/insights/overdue" className="mg-btn-sm in-btn-fit">See overdue loans</Link>
                    </>
                ) : (
                    <span>No loans are past the {OVERDUE_DAYS}-day loan period</span>
                )}
            </div>
        </section>
    );
};

export default LoanAge;
