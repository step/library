import React, { memo } from 'react';
import { Star } from 'lucide-react';
import { Book } from "@/types/Book";
import { MAX_RATING, readersLabel } from '../utils/ratings';

type BookRowProps = {
    book: Book;
};

/** Average rating beside the author: "★ 4.6 (18)", or "No ratings". */
const AverageRating = ({ book }: BookRowProps) => {
    // A list served from an older cache may not carry ratings yet: show nothing rather than "No ratings".
    if (book.ratingCount === undefined) return null;
    if (!book.ratingCount || book.ratingAverage === null) {
        return (
            <>
                <span className="bk-avg is-none" aria-hidden="true"><span className="bk-avg-n">No ratings</span></span>
                <span className="bk-sr">No ratings yet</span>
            </>
        );
    }
    const average = book.ratingAverage.toFixed(1);
    return (
        <>
            <span className="bk-avg" aria-hidden="true">
                <Star size={14} className="bk-avg-star" />
                <span className="bk-avg-n">{average}</span>
                <span className="bk-avg-c">({book.ratingCount})</span>
            </span>
            <span className="bk-sr">Rated {average} out of {MAX_RATING} by {readersLabel(book.ratingCount)}</span>
        </>
    );
};

const BookRow = memo(({ book }: BookRowProps) => {
    const available = book.count - book.borrowedCount;
    const none = available === 0;

    return (
        <div className="bk-row">
            <div className="bk-ttl">
                <div className="bk-t">{book.title}</div>
                <div className="bk-sline">
                    <div className="bk-a">{book.authors}</div>
                    <AverageRating book={book} />
                </div>
            </div>
            <div className="bk-stat">
                <span className="bk-lbl">Total</span>
                <span className="bk-num">{book.count}</span>
            </div>
            <div className="bk-stat">
                <span className="bk-lbl">Borrowed</span>
                <span className="bk-num">{book.borrowedCount}</span>
            </div>
            <div className="bk-stat">
                <span className="bk-lbl">Available</span>
                <span className="bk-avail">
                    <span className={`bk-num ${none ? 'bk-out' : 'bk-ok'}`}>{available}</span>
                    {none && <span className="bk-tag">None left</span>}
                </span>
            </div>
        </div>
    );
});

BookRow.displayName = 'BookRow';

export default BookRow;
