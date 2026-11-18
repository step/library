"use client";
import { useCallback, useId, useRef, useState } from "react";
import { RatingFailure, removeRating, saveRating } from "../../src/app/BooksApi";
import { ratingLabel } from "../../utils/ratings";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { lexend } from "../../src/app/lib/fonts";
import StarInput from "./StarInput";
import RatingError from "./RatingError";
import "../../styles/Ratings.css";

export type RatingTarget = {
    bookId: number;
    title: string;
    authors: string;
    /** The reader's current rating, or null when they have not rated the book. */
    rating: number | null;
};

type Props = {
    book: RatingTarget;
    onClose: () => void;
    onSaved: (rating: number) => void;
    onRemoved: () => void;
    onRemoveFailed: () => void;
};

/** Rate a past read, or change or remove an existing rating. A sheet on phones, centred above. */
const RatingDialog = ({ book, onClose, onSaved, onRemoved, onRemoveFailed }: Props) => {
    const [draft, setDraft] = useState(book.rating ?? 0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<RatingFailure | null>(null);
    const dialog = useRef<HTMLDivElement>(null);
    const titleId = `${useId()}-t`;
    const hasExisting = book.rating !== null;

    const close = useCallback(() => {
        if (!busy) onClose();
    }, [busy, onClose]);
    useFocusTrap(dialog, close);

    const save = async () => {
        if (draft < 1 || busy) return;
        setBusy(true);
        setError(null);
        const result = await saveRating(book.bookId, draft);
        setBusy(false);
        if (result.success) onSaved(draft);
        else setError(result.reason);
    };

    const remove = async () => {
        if (busy) return;
        setBusy(true);
        const result = await removeRating(book.bookId);
        setBusy(false);
        if (result.success) onRemoved();
        else onRemoveFailed();
    };

    return (
        <div className={`rt-root rt-modal ${lexend.variable}`} onClick={e => { if (e.target === e.currentTarget) close(); }}>
            <div className="rt-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
                <div className="rt-eyebrow">{hasExisting ? "Edit your rating" : "Rate this book"}</div>
                <h2 className="rt-dialog-t" id={titleId}>{book.title}</h2>
                <p className="rt-author">{book.authors}</p>
                <StarInput value={draft} onChange={r => { setDraft(r); setError(null); }} labelledBy={titleId} size="lg" disabled={busy} />
                <p className="rt-star-label rt-star-label-lg" aria-live="polite">
                    {draft ? ratingLabel(draft) : "Tap a star to choose your rating"}
                </p>
                {error && <RatingError reason={error} context="dialog" />}
                <div className="rt-dialog-act">
                    <button type="button" className="rt-btn-outline" disabled={busy} onClick={close}>Cancel</button>
                    <button type="button" className="rt-btn" disabled={draft < 1 || busy} onClick={save}>
                        {error ? "Try again" : "Save rating"}
                    </button>
                </div>
                {hasExisting && (
                    <button type="button" className="rt-link rt-link-red" disabled={busy} onClick={remove}>Remove my rating</button>
                )}
            </div>
        </div>
    );
};

export default RatingDialog;
