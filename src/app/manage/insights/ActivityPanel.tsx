"use client";
import { useRef, useState } from "react";
import { ActivityPoint } from "@/types/Insights";
import { ACTIVITY_RANGES, ActivityRange, DEFAULT_ACTIVITY_RANGE } from "@/utils/insights";
import { fetchActivity } from "./action";
import LineChart from "./LineChart";

const RANGES = Object.entries(ACTIVITY_RANGES) as [ActivityRange, (typeof ACTIVITY_RANGES)[ActivityRange]][];

/** Borrows and returns over time, with a 30-day / 90-day / 12-month switch. */
const ActivityPanel = ({ initial }: { initial: ActivityPoint[] }) => {
    const [range, setRange] = useState<ActivityRange>(DEFAULT_ACTIVITY_RANGE);
    const [points, setPoints] = useState(initial);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    // Only the latest request may update the chart, however the answers arrive.
    const latest = useRef(0);

    const choose = async (next: ActivityRange) => {
        if (next === range && !error) return;
        const request = ++latest.current;
        setRange(next);
        setLoading(true);
        setError(false);
        try {
            const data = await fetchActivity(next);
            if (request === latest.current) setPoints(data);
        } catch {
            if (request === latest.current) setError(true);
        } finally {
            if (request === latest.current) setLoading(false);
        }
    };

    const borrowed = points.reduce((s, p) => s + p.borrowed, 0);
    const returned = points.reduce((s, p) => s + p.returned, 0);

    return (
        <section className="in-card" aria-labelledby="in-activity-h" aria-busy={loading}>
            <div className="in-card-head">
                <div>
                    <h2 className="in-h2" id="in-activity-h">Borrows and returns</h2>
                    <p className="in-desc">{ACTIVITY_RANGES[range].caption}</p>
                </div>
                <div className="in-seg" role="group" aria-label="Period">
                    {RANGES.map(([key, r]) => (
                        <button key={key} type="button" className="in-seg-b" aria-pressed={key === range} onClick={() => choose(key)}>
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>
            {error ? (
                <div className="in-error" role="alert">
                    <span>Unable to load data</span>
                    <button type="button" className="mg-btn-sm in-btn-fit" onClick={() => choose(range)}>Retry</button>
                </div>
            ) : (
                <div className={loading ? "in-dim" : undefined}>
                    <LineChart points={points} caption={`Borrows and returns, ${ACTIVITY_RANGES[range].caption.toLowerCase()}`} />
                    <p className="in-note">{borrowed} borrowed and {returned} returned in this period.</p>
                </div>
            )}
        </section>
    );
};

export default ActivityPanel;
