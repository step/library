import React, { memo } from 'react';
import { Book } from "@/types/Book";

type BookRowProps = {
    book: Book;
};

const BookRow = memo(({ book }: BookRowProps) => {
    const available = book.count - book.borrowedCount;
    const none = available === 0;

    return (
        <div className="bk-row">
            <div className="bk-ttl">
                <div className="bk-t">{book.title}</div>
                <div className="bk-a">{book.authors}</div>
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
