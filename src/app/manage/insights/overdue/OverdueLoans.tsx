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
                <div className="in-scroll">
                    <table className="in-table">
                        <thead>
                            <tr>
                                <th scope="col">Reader</th>
                                <th scope="col">Book</th>
                                <th scope="col">Borrowed on</th>
                                <th scope="col" className="in-num">Out for</th>
                                <th scope="col">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loans.map(l => (
                                <tr key={l.id}>
                                    <th scope="row">
                                        <span className="in-cell-t">{l.readerName}</span>
                                        <span className="in-desc">{l.readerEmail} · Batch {l.batchId}</span>
                                    </th>
                                    <td>
                                        <span className="in-cell-t">{l.title}</span>
                                        <span className="in-desc">{l.authors}</span>
                                    </td>
                                    <td className="in-nowrap">{formatShortDate(l.borrowedDate)}</td>
                                    <td className="in-num in-nowrap">{l.daysOut} days</td>
                                    <td>
                                        {l.daysOut >= VERY_OVERDUE_DAYS
                                            ? <span className="in-badge in-badge-err">Very overdue</span>
                                            : <span className="in-badge in-badge-warn">Overdue</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
};

export default OverdueLoans;
