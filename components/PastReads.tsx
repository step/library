"use client";
import { useCallback, useEffect, useState } from "react";
import "../styles/Books.css";
import "../styles/Ratings.css";
import { ReturnedBook } from '../types/BorrowedBook';
import { formatDuration, formatShortDate } from '../utils/dateUtils';
import { ratingLabel } from '../utils/ratings';
import { useSnackbar } from '../utils/useSnackbar';
import { lexend } from '../src/app/lib/fonts';
import Stars from './ratings/Stars';
import RatingDialog, { RatingTarget } from './ratings/RatingDialog';
import Snackbar from './Snackbar';

/** Toasts that another page can ask Past reads to show on arrival (/history?toast=...). */
export const ARRIVAL_TOASTS = {
    rated: "Thanks, your rating is saved",
    returned: "Book returned",
} as const;
export type ArrivalToast = keyof typeof ARRIVAL_TOASTS;

type RowProps = { book: ReturnedBook; rating: number | null; onRate: (book: ReturnedBook) => void };

const PastReadRow = ({ book, rating, onRate }: RowProps) => (
    <li className="bk-row bk-cols-history">
        <div className="bk-ttl">
            <div className="bk-t">{book.title}</div>
            <div className="bk-a">{book.authors}</div>
        </div>
        <div className="bk-stat">
            <span className="bk-lbl">Borrowed on</span>
            <span className="bk-val">{formatShortDate(book.borrowedDate)}</span>
        </div>
        <div className="bk-stat">
            <span className="bk-lbl">Returned on</span>
            <span className="bk-val">{formatShortDate(book.returnedDate)}</span>
        </div>
        <div className="bk-stat">
            <span className="bk-lbl">Kept for</span>
            <span className="bk-val">{formatDuration(book.borrowedDate, book.returnedDate)}</span>
        </div>
        <div className="rt-cell">
            {rating ? (
                <span className="rt-view">
                    <Stars value={rating} />
                    <span className="rt-text">{ratingLabel(rating)}</span>
                </span>
            ) : (
                <span className="rt-none">Not rated yet</span>
            )}
            <button
                type="button"
                className="rt-btn-sm"
                aria-label={rating ? `Edit your rating for ${book.title}` : `Rate ${book.title}`}
                onClick={() => onRate(book)}
            >
                <span className="rt-long">{rating ? "Edit rating" : "Rate this book"}</span>
                <span className="rt-short">{rating ? "Edit" : "Rate"}</span>
            </button>
        </div>
    </li>
);

type Props = { books: ReturnedBook[]; toast?: ArrivalToast };

const PastReads = ({ books, toast }: Props) => {
    // Ratings changed on this page, by book id (null = removed). A rating belongs to the book,
    // so every loan of the same book shows the change.
    const [changed, setChanged] = useState<Record<number, number | null>>({});
    const [target, setTarget] = useState<RatingTarget | null>(null);
    const { snackbar, showSuccess, showError, close } = useSnackbar();

    useEffect(() => {
        if (!toast) return;
        showSuccess(ARRIVAL_TOASTS[toast]);
        // Drop ?toast= so a reload or Back does not show it again.
        window.history.replaceState(window.history.state, "", window.location.pathname);
    }, [toast, showSuccess]);

    const ratingOf = useCallback(
        (book: ReturnedBook) => (book.bookId in changed ? changed[book.bookId] : book.rating),
        [changed],
    );

    const openDialog = useCallback((book: ReturnedBook) => {
        setTarget({ bookId: book.bookId, title: book.title, authors: book.authors, rating: ratingOf(book) });
    }, [ratingOf]);

    const closeDialog = useCallback(() => setTarget(null), []);

    const setRating = (bookId: number, rating: number | null) => setChanged(prev => ({ ...prev, [bookId]: rating }));

    return (
        <div className={`bk-page ${lexend.variable}`}>
            <h1 className="bk-h1">Past reads</h1>
            <p className="bk-sub">Books you have borrowed and returned.</p>
            {books.length === 0 ? (
                <div className="bk-empty">
                    <p className="bk-empty-t">No past reads yet</p>
                    <p className="bk-empty-s">Books you return will show up here.</p>
                </div>
            ) : (
                <>
                    <p className="bk-count">{books.length} {books.length === 1 ? 'book' : 'books'} returned</p>
                    <div className="bk-table">
                        <div className="bk-thead bk-cols-history" aria-hidden="true">
                            <span>Title and author</span><span>Borrowed on</span><span>Returned on</span><span>Kept for</span>
                            <span className="bk-th-rate">Your rating</span>
                        </div>
                        <ul className="bk-list">
                            {books.map((book) => <PastReadRow key={book.id} book={book} rating={ratingOf(book)} onRate={openDialog} />)}
                        </ul>
                    </div>
                </>
            )}
            {target && (
                <RatingDialog
                    book={target}
                    onClose={closeDialog}
                    onSaved={rating => {
                        setRating(target.bookId, rating);
                        setTarget(null);
                        showSuccess("Thanks, your rating is saved");
                    }}
                    onRemoved={() => {
                        setRating(target.bookId, null);
                        setTarget(null);
                        showSuccess("Rating removed");
                    }}
                    onRemoveFailed={() => {
                        setTarget(null);
                        showError("Could not remove your rating. Try again.");
                    }}
                />
            )}
            <Snackbar
                message={snackbar.message}
                type={snackbar.type}
                isOpen={snackbar.isOpen}
                onClose={close}
                duration={4000}
                autoClose={true}
            />
        </div>
    );
};

export default PastReads;
