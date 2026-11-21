"use client";
import { useRef, useState } from "react";
import { TopReaders } from "@/types/Insights";
import { TOP_READER_LIMITS, TopReadersQuery, isoDay, parseTopReadersQuery } from "@/utils/insights";
import { fetchTopReaders } from "./action";

const DAY = 86_400_000;
const shiftDays = (day: string, days: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY));
const niceDay = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Readers who borrowed most between two chosen days, top 5 to 50 (10 by default). */
const TopReadersPanel = ({ initial }: { initial: TopReaders }) => {
    // The server's default period ends today; using it keeps server and browser renders identical.
    const today = initial.to;
    const presets = [
        { label: "Last 30 days", from: shiftDays(today, -30), to: today },
        { label: "Last 90 days", from: shiftDays(today, -90), to: today },
        { label: "This year", from: `${today.slice(0, 4)}-01-01`, to: today },
    ];

    const [query, setQuery] = useState<TopReadersQuery>({ from: initial.from, to: initial.to, limit: initial.limit });
    const [data, setData] = useState(initial);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const latest = useRef(0);

    const load = async (next: TopReadersQuery) => {
        setQuery(next);
        const parsed = parseTopReadersQuery(next);
        if (!parsed.ok) {
            latest.current++; // a slower earlier answer must not replace the error
            setError(parsed.message);
            return;
        }
        const request = ++latest.current;
        setError(null);
        setLoading(true);
        try {
            const result = await fetchTopReaders(parsed.value);
            if (request !== latest.current) return;
            if (result.ok) setData(result.data);
            else setError(result.message);
        } catch {
            if (request === latest.current) setError("Unable to load data");
        } finally {
            if (request === latest.current) setLoading(false);
        }
    };

    const max = Math.max(1, ...data.readers.map(r => r.count));
    const showing = !error && data.readers.length > 0;

    return (
        <section className="in-card in-card-flush" aria-labelledby="in-top-h" aria-busy={loading}>
            <div className="in-card-pad in-top-controls">
                <div className="in-card-head">
                    <div>
                        <h2 className="in-h2" id="in-top-h">Top readers</h2>
                        <p className="in-desc">Most books borrowed, {niceDay(data.from)} to {niceDay(data.to)}</p>
                    </div>
                    <div className="in-seg" role="group" aria-label="Quick periods">
                        {presets.map(p => (
                            <button
                                key={p.label}
                                type="button"
                                className="in-seg-b"
                                aria-pressed={query.from === p.from && query.to === p.to}
                                onClick={() => load({ ...query, from: p.from, to: p.to })}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="in-fields">
                    <label className="in-field">
                        <span>From</span>
                        <input type="date" value={query.from} max={today} aria-invalid={!!error}
                            onChange={e => load({ ...query, from: e.target.value })} />
                    </label>
                    <label className="in-field">
                        <span>To</span>
                        <input type="date" value={query.to} max={today} aria-invalid={!!error}
                            onChange={e => load({ ...query, to: e.target.value })} />
                    </label>
                    <label className="in-field in-field-sm">
                        <span>Show</span>
                        <select value={query.limit} onChange={e => load({ ...query, limit: Number(e.target.value) })}>
                            {TOP_READER_LIMITS.map(n => <option key={n} value={n}>Top {n}</option>)}
                        </select>
                    </label>
                </div>
                {error && <p className="in-field-err" role="alert">{error}</p>}
            </div>

            {showing && (
                <div className={loading ? "in-dim" : undefined}>
                    <div className="in-rank-head" aria-hidden="true">
                        <span>Rank</span><span>Reader</span><span>Batch</span><span>Books borrowed</span><span className="in-num">Books</span><span>Now</span>
                    </div>
                    <ol className="in-rank">
                        {data.readers.map(r => (
                            <li key={r.id} className="in-rank-row">
                                <span className={`in-rank-n ${r.rank <= 3 ? "is-top" : ""}`}>
                                    <span className="mg-sr">Rank </span>{r.rank}
                                </span>
                                <span className="in-rank-name">{r.name}</span>
                                <span className="in-rank-batch">Batch {r.batchId}</span>
                                <span className="in-rank-bar" aria-hidden="true"><span style={{ width: `${(r.count / max) * 100}%` }} /></span>
                                <span className="in-rank-count in-num">{r.count} {r.count === 1 ? "book" : "books"}</span>
                                <span className="in-rank-now">{r.readingNow && <span className="in-badge in-badge-info">Reading now</span>}</span>
                            </li>
                        ))}
                    </ol>
                    <p className="in-note in-card-pad">
                        Showing {data.readers.length} of {data.totalReaders} {data.totalReaders === 1 ? "reader" : "readers"} who
                        borrowed in this period · {data.totalBorrows} {data.totalBorrows === 1 ? "borrow" : "borrows"} in total. Ties share a rank.
                    </p>
                </div>
            )}

            {!error && data.readers.length === 0 && (
                <div className="in-empty">
                    <p className="in-empty-t">No books were borrowed in this period</p>
                    <p className="in-desc">Try a longer period.</p>
                    <button type="button" className="mg-btn-sm in-btn-fit" onClick={() => load({ ...query, ...presets[1] })}>
                        Show last 90 days
                    </button>
                </div>
            )}
        </section>
    );
};

export default TopReadersPanel;
