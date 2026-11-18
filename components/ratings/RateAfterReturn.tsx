"use client";
import { useCallback, useId, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { ReturnedBookInfo } from "../../types/Book";
import { RatingFailure, saveRating } from "../../src/app/BooksApi";
import { ratingLabel } from "../../utils/ratings";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { lexend } from "../../src/app/lib/fonts";
import StarInput from "./StarInput";
import RatingError from "./RatingError";
import "../../styles/Ratings.css";

type Props = {
    book: ReturnedBookInfo;
    /** "rated" after the rating is saved; "skipped" when the reader skips or closes. */
    onDone: (outcome: "rated" | "skipped") => void;
};

/**
 * Shown after a book is returned. Rating is optional; the return has already happened, so a
 * failed save never undoes it. A reader who rated the book before starts with that rating.
 */
const RateAfterReturn = ({ book, onDone }: Props) => {
    const [rating, setRating] = useState(book.myRating ?? 0);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<RatingFailure | null>(null);
    const panel = useRef<HTMLDivElement>(null);
    const ids = useId();
    const headingId = `${ids}-h`;
    const promptId = `${ids}-p`;

    const skip = useCallback(() => {
        if (!saving) onDone("skipped");
    }, [saving, onDone]);
    useFocusTrap(panel, skip);

    const save = async () => {
        if (rating < 1 || saving) return;
        setSaving(true);
        setError(null);
        const result = await saveRating(book.id, rating);
        setSaving(false);
        if (result.success) onDone("rated");
        else setError(result.reason);
    };

    return (
        <div className={`rt-root rt-done-layer ${lexend.variable}`}>
            <div className="rt-done" ref={panel} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1}>
                <button type="button" className="rt-done-x" aria-label="Close" onClick={skip}>
                    <X size={22} aria-hidden="true" />
                </button>
                <div className="rt-done-top">
                    <span className="rt-done-ic"><Check size={32} strokeWidth={2.25} aria-hidden="true" /></span>
                    <h2 className="rt-done-h" id={headingId}>Book returned</h2>
                    <p className="rt-done-b"><strong>{book.title}</strong><br />{book.authors}</p>
                </div>
                <div className="rt-rate-box">
                    <div className="rt-rate-box-h">
                        <span className="rt-rate-box-t" id={promptId}>How was it?</span>
                        <span className="rt-optional">Optional</span>
                    </div>
                    <StarInput value={rating} onChange={r => { setRating(r); setError(null); }} labelledBy={promptId} disabled={saving} />
                    <div className="rt-star-foot">
                        <span className="rt-star-label" aria-live="polite">
                            {rating ? ratingLabel(rating) : "Tap a star to rate, or skip"}
                        </span>
                        {rating > 0 && (
                            <button type="button" className="rt-link" disabled={saving} onClick={() => setRating(0)}>Clear</button>
                        )}
                    </div>
                </div>
                {error && <RatingError reason={error} context="return" />}
                <div className="rt-done-act">
                    <button type="button" className="rt-btn" disabled={rating < 1 || saving} onClick={save}>
                        {error ? "Try again" : "Save rating"}
                    </button>
                    <button type="button" className="rt-btn-outline" disabled={saving} onClick={skip}>Skip for now</button>
                </div>
            </div>
        </div>
    );
};

export default RateAfterReturn;
