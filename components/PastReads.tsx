"use client";
import "../styles/Books.css";
import { ReturnedBook } from '../types/BorrowedBook';
import { formatDuration, formatShortDate } from '../utils/dateUtils';
import { lexend } from '../src/app/lib/fonts';

const PastReadRow = ({ book }: { book: ReturnedBook }) => (
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
    </li>
);

const PastReads = ({ books }: { books: ReturnedBook[] }) => (
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
                    </div>
                    <ul className="bk-list">
                        {books.map((book) => <PastReadRow key={book.id} book={book} />)}
                    </ul>
                </div>
            </>
        )}
    </div>
);

export default PastReads;
