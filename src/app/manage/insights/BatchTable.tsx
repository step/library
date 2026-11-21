import { BatchEngagement } from "@/types/Insights";

/** Below this share of members having borrowed, a batch's bar turns orange. */
const LOW_SHARE = 50;

const share = (b: BatchEngagement) => (b.members ? Math.round((b.borrowers / b.members) * 100) : 0);
const joined = (day: string | null) =>
    day && `First member added ${new Date(day).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}`;

/** Members per batch and how many have started borrowing. */
const BatchTable = ({ batches }: { batches: BatchEngagement[] }) => {
    const newest = batches[0];
    const newestWaiting = newest ? newest.members - newest.borrowers : 0;
    return (
        <section className="in-card in-card-flush" aria-labelledby="in-batch-h">
            <div className="in-card-pad">
                <h2 className="in-h2" id="in-batch-h">Members by batch</h2>
                <p className="in-desc">Who has started using the library. All time.</p>
            </div>
            {batches.length === 0 ? (
                <p className="in-note in-card-pad">No members yet.</p>
            ) : (
                <>
                    <div className="in-scroll">
                        <table className="in-table">
                            <thead>
                                <tr>
                                    <th scope="col">Batch</th>
                                    <th scope="col" className="in-num">Members</th>
                                    <th scope="col" className="in-col-share">Borrowed at least once</th>
                                    <th scope="col" className="in-num">Borrows per member</th>
                                    <th scope="col" className="in-num">Never borrowed</th>
                                </tr>
                            </thead>
                            <tbody>
                                {batches.map(b => (
                                    <tr key={b.batchId}>
                                        <th scope="row">
                                            <span className="in-cell-t">Batch {b.batchId}</span>
                                            {b.joined && <span className="in-desc">{joined(b.joined)}</span>}
                                        </th>
                                        <td className="in-num">{b.members}</td>
                                        <td>
                                            <span className="in-share">
                                                <span className={`in-share-track ${share(b) < LOW_SHARE ? "is-low" : ""}`} aria-hidden="true">
                                                    <span style={{ width: `${share(b)}%` }} />
                                                </span>
                                                <span className="in-nowrap">{b.borrowers} · {share(b)}%</span>
                                            </span>
                                        </td>
                                        <td className="in-num">{b.members ? (b.borrows / b.members).toFixed(1) : "0.0"}</td>
                                        <td className="in-num">{b.members - b.borrowers}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {newestWaiting > 0 && (
                        <p className="in-note in-card-pad in-card-topline">
                            Batch {newest.batchId}: {newestWaiting} of {newest.members} members have not borrowed yet.
                            Pointing them to the &ldquo;How it works&rdquo; tour can help them start.
                        </p>
                    )}
                </>
            )}
        </section>
    );
};

export default BatchTable;
