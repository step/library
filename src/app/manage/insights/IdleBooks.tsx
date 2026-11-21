"use client";
import { useState } from "react";
import { IdleBook } from "@/types/Insights";
import { IDLE_MONTHS } from "@/utils/insights";

const PREVIEW = 5;

const lastOut = (day: string | null) =>
    day === null
        ? "Never borrowed"
        : `Last out ${new Date(day).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}`;

/** Books on the shelf that nobody has borrowed for a while: candidates to promote or give away. */
const IdleBooks = ({ books }: { books: IdleBook[] }) => {
    const [showAll, setShowAll] = useState(false);
    const never = books.filter(b => b.lastBorrowed === null).length;
    const copies = books.reduce((s, b) => s + b.copies, 0);
    const visible = showAll ? books : books.slice(0, PREVIEW);

    return (
        <section className="in-card in-card-flush" aria-labelledby="in-idle-h">
            <div className="in-card-pad in-card-head">
                <div>
                    <h2 className="in-h2" id="in-idle-h">Books nobody borrows</h2>
                    <p className="in-desc">Not borrowed in the last {IDLE_MONTHS} months, and no copy out now</p>
                </div>
                {books.length > 0 && (
                    <div className="in-idle-total">
                        <span className="in-idle-n">{books.length} {books.length === 1 ? "book" : "books"}</span>
                        <span className="in-desc">{never} never borrowed · {copies} {copies === 1 ? "copy" : "copies"}</span>
                    </div>
                )}
            </div>
            {books.length === 0 ? (
                <p className="in-note in-card-pad">Every book has been borrowed in the last {IDLE_MONTHS} months.</p>
            ) : (
                <>
                    <ul className="in-idle" id="in-idle-list">
                        {visible.map(b => (
                            <li key={b.id}>
                                <span>
                                    <span className="in-idle-t">{b.title}</span>
                                    <span className="in-desc">{b.authors} · {b.copies} {b.copies === 1 ? "copy" : "copies"}</span>
                                </span>
                                <span className="in-desc in-nowrap">{lastOut(b.lastBorrowed)}</span>
                            </li>
                        ))}
                    </ul>
                    {books.length > PREVIEW && (
                        <div className="in-card-pad in-idle-more">
                            <button type="button" className="in-textbtn" aria-expanded={showAll} aria-controls="in-idle-list"
                                onClick={() => setShowAll(v => !v)}>
                                {showAll ? "Show fewer" : `Show all ${books.length} books`}
                            </button>
                        </div>
                    )}
                </>
            )}
        </section>
    );
};

export default IdleBooks;
