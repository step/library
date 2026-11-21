"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { OverdueLoan } from "@/types/Insights";
import { OVERDUE_DAYS } from "@/utils/insights";
import { formatShortDate } from "@/utils/dateUtils";

/** Twice the loan period counts as very overdue. */
const VERY_OVERDUE_DAYS = OVERDUE_DAYS * 2;

/** Each reader's address once, in the order they appear. */
export const uniqueEmails = (loans: OverdueLoan[]) => [...new Set(loans.map(l => l.readerEmail))];

const OverdueLoans = ({ loans }: { loans: OverdueLoan[] }) => {
    const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
    const emails = uniqueEmails(loans);
    const very = loans.filter(l => l.daysOut >= VERY_OVERDUE_DAYS).length;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(emails.join("\n"));
            setCopyState("copied");
        } catch {
            setCopyState("failed");
        }
    };

    if (loans.length === 0) {
        return (
            <div className="in-empty in-card">
                <p className="in-empty-t">No overdue loans</p>
                <p className="in-desc">Every copy that is out was borrowed in the last {OVERDUE_DAYS} days.</p>
            </div>
        );
    }

    return (
        <>
            <div className="in-kpis in-kpis-3">
                <div className="in-kpi">
                    <span className="in-kpi-l">Over {VERY_OVERDUE_DAYS} days</span>
                    <span className={`in-kpi-v ${very > 0 ? "in-red" : ""}`}>{very}</span>
                </div>
                <div className="in-kpi">
                    <span className="in-kpi-l">{OVERDUE_DAYS}–{VERY_OVERDUE_DAYS} days</span>
                    <span className="in-kpi-v">{loans.length - very}</span>
                </div>
                <div className="in-kpi">
                    <span className="in-kpi-l">Readers to contact</span>
                    <span className="in-kpi-v">{emails.length}</span>
                </div>
            </div>

            <div className="in-actions">
                <button type="button" className="mg-btn in-btn-fit" onClick={copy}>
                    <Copy size={18} aria-hidden="true" />
                    <span>Copy reader emails</span>
                </button>
                <span className="in-desc" role="status">
                    {copyState === "copied" && `Copied ${emails.length} ${emails.length === 1 ? "email" : "emails"}, one per line.`}
                    {copyState === "failed" && "Could not copy. Select the emails in the table instead."}
                </span>
            </div>

            <section className="in-card in-card-flush" aria-label="Overdue loans">
                {/* A table on wider screens; on phones each row is restyled as a card (Insights.css).
                    The explicit roles keep it announced as a table once CSS changes its display. */}
                <table className="in-table in-table-stack" role="table">
                    <thead role="rowgroup">
                        <tr role="row">
                            <th scope="col" role="columnheader">Reader</th>
                            <th scope="col" role="columnheader">Book</th>
                            <th scope="col" role="columnheader">Borrowed on</th>
                            <th scope="col" role="columnheader" className="in-num">Out for</th>
                            <th scope="col" role="columnheader">Status</th>
                        </tr>
                    </thead>
                    <tbody role="rowgroup">
                        {loans.map(l => (
                            <tr key={l.id} role="row">
                                <th scope="row" role="rowheader" className="in-c-reader">
                                    <span className="in-cell-t">{l.readerName}</span>
                                    <span className="in-desc in-email">{l.readerEmail} · Batch {l.batchId}</span>
                                </th>
                                <td role="cell" className="in-c-book">
                                    <span className="in-cell-t">{l.title}</span>
                                    <span className="in-desc">{l.authors}</span>
                                </td>
                                <td role="cell" className="in-c-date in-nowrap">
                                    <span className="in-mlabel" aria-hidden="true">Borrowed </span>{formatShortDate(l.borrowedDate)}
                                </td>
                                <td role="cell" className="in-c-days in-num in-nowrap">
                                    {l.daysOut} days<span className="in-mlabel" aria-hidden="true"> out</span>
                                </td>
                                <td role="cell" className="in-c-status">
                                    {l.daysOut >= VERY_OVERDUE_DAYS
                                        ? <span className="in-badge in-badge-err">Very overdue</span>
                                        : <span className="in-badge in-badge-warn">Overdue</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </>
    );
};

export default OverdueLoans;
