"use client";
import LoadingView from '@/app/loading';
import "../styles/Books.css";
import { BorrowedBook } from '../types/BorrowedBook';
import { formatShortDate, formatTimeSince } from '../utils/dateUtils';
import { lexend } from '../src/app/lib/fonts';

const ReadingBookRow = ({ book }: { book: BorrowedBook }) => (
    <li className="bk-row bk-cols-reading">
        <div className="bk-ttl">
            <div className="bk-t">{book.title}</div>
            <div className="bk-a">{book.authors}</div>
        </div>
        <div className="bk-stat">
            <span className="bk-lbl">Date borrowed</span>
            <span className="bk-val">{formatShortDate(book.borrowedDate)}</span>
        </div>
        <div className="bk-stat">
            <span className="bk-lbl">Time since</span>
            <span className="bk-val">{formatTimeSince(book.borrowedDate)}</span>
        </div>
    </li>
);

const ReadingBooks = (props: { books?: BorrowedBook[] }) => {
    if (props.books === undefined) {
        return (
            <LoadingView />
        );
    }

    const { books } = props;

    return (
        <div className={`bk-page ${lexend.variable}`}>
            <h1 className="bk-h1">Reading</h1>
            <p className="bk-sub">Books you have borrowed right now.</p>
            {books.length === 0 ? (
                <div className="bk-empty">
                    <p className="bk-empty-t">No books currently borrowed</p>
                    <p className="bk-empty-s">Scan a book&apos;s QR code on the Books page to borrow it.</p>
                </div>
            ) : (
                <>
                    <p className="bk-count">{books.length} {books.length === 1 ? 'book' : 'books'} borrowed</p>
                    <div className="bk-table">
                        <div className="bk-thead bk-cols-reading" aria-hidden="true">
                            <span>Title and author</span><span>Date borrowed</span><span>Time since</span>
                        </div>
                        <ul className="bk-list">
                            {books.map((book) => <ReadingBookRow key={book.id} book={book} />)}
                        </ul>
                    </div>
                </>
            )}
        </div>
    );
};

export default ReadingBooks;
