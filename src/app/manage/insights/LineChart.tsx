import { ActivityPoint } from "@/types/Insights";

/** A y-axis top that splits into whole-number halves: 4, 8, 12... */
export const axisTop = (max: number) => Math.max(4, Math.ceil(max / 4) * 4);

// Seven labels overlapped on a phone-width chart; five fit, and 13 weeks then end on a label.
const MAX_X_LABELS = 5;

/**
 * Borrowed and returned as two lines. The drawing is decoration (aria-hidden); a visually hidden
 * table carries the same numbers for screen readers. Returned is dashed so the lines differ
 * without relying on colour.
 */
const LineChart = ({ points, caption }: { points: ActivityPoint[]; caption: string }) => {
    const top = axisTop(Math.max(0, ...points.map(p => Math.max(p.borrowed, p.returned))));
    const last = Math.max(1, points.length - 1);
    const x = (i: number) => (i / last) * 100;
    const y = (v: number) => 100 - (v / top) * 100;
    const line = (key: "borrowed" | "returned") => points.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
    const labelEvery = Math.ceil(points.length / MAX_X_LABELS);

    return (
        <figure className="in-chart">
            <div className="in-chart-body" aria-hidden="true">
                <div className="in-chart-y">
                    <span>{top}</span>
                    <span>{top / 2}</span>
                    <span>0</span>
                </div>
                <div className="in-chart-plot">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
                        {[0, 50, 100].map(v => (
                            <line key={v} x1="0" x2="100" y1={v} y2={v} className="in-grid" vectorEffect="non-scaling-stroke" />
                        ))}
                        <polyline points={line("returned")} className="in-line in-line-ret" vectorEffect="non-scaling-stroke" />
                        <polyline points={line("borrowed")} className="in-line in-line-bor" vectorEffect="non-scaling-stroke" />
                    </svg>
                    <div className="in-chart-x">
                        {points.map((p, i) => i % labelEvery === 0 && (
                            <span key={i} style={{ left: `${x(i)}%` }} className={i === 0 ? "is-first" : i === last ? "is-last" : ""}>
                                {p.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
            <figcaption className="in-legend">
                <span><i className="in-key in-key-bor" aria-hidden="true" />Borrowed</span>
                <span><i className="in-key in-key-ret" aria-hidden="true" />Returned</span>
            </figcaption>
            <table className="mg-sr">
                <caption>{caption}</caption>
                <thead><tr><th scope="col">Period starting</th><th scope="col">Borrowed</th><th scope="col">Returned</th></tr></thead>
                <tbody>
                    {points.map((p, i) => (
                        <tr key={i}><th scope="row">{p.label}</th><td>{p.borrowed}</td><td>{p.returned}</td></tr>
                    ))}
                </tbody>
            </table>
        </figure>
    );
};

export default LineChart;
