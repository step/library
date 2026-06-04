"use client";

import { useState, useTransition } from 'react';
import { BorrowedBookWithUser } from "@/types/BorrowedBook";
import BookCover from "@/components/BookCover";
import "@/styles/BookRow.css";
import { formatBorrowDate } from "@/utils/dateUtils";
import { forceReturnBook } from "./action";
import { useSnackbar } from "@/utils/useSnackbar";
import Snackbar from "@/components/Snackbar";

const BorrowedBookRow = ({
    book,
    index,
    onReturned,
}: {
    book: BorrowedBookWithUser;
    index: number;
    onReturned: (id: number) => void;
}) => {
    const [isPending, startTransition] = useTransition();
    const { snackbar, showSuccess, showError, close } = useSnackbar();

    const handleReturn = () => {
        startTransition(async () => {
            const result = await forceReturnBook(book.id, book.bookCopyId);
            if (result.success) {
                showSuccess(result.message);
                setTimeout(() => onReturned(book.id), 1000);
            } else {
                showError(result.message);
            }
        });
    };

    return (
        <>
            <div className="book-row">
                <div className="book-row-cover">
                    <BookCover title={book.title} author={book.authors} index={index} />
                </div>
                <div className="book-row-details">
                    <div className="book-row-title-author">
                        <h6 className="book-row-title">{book.title}</h6>
                        <p className="book-row-author">by {book.authors}</p>
                    </div>
                    <div className="borrowed-book-details">
                        <p>Borrowed by: {book.borrowerName}</p>
                        <p>Borrowed on: {formatBorrowDate(book.borrowedDate)}</p>
                    </div>
                    <button
                        className="force-return-btn"
                        onClick={handleReturn}
                        disabled={isPending}
                    >
                        {isPending ? 'Updating...' : 'Mark as Returned'}
                    </button>
                </div>
            </div>
            <Snackbar
                isOpen={snackbar.isOpen}
                message={snackbar.message}
                type={snackbar.type}
                onClose={close}
            />
        </>
    );
};

const BorrowedBooks = ({ borrowedBooks }: { borrowedBooks: BorrowedBookWithUser[] }) => {
    const [returnedIds, setReturnedIds] = useState<Set<number>>(new Set());

    const handleReturned = (id: number) => {
        setReturnedIds(prev => new Set([...prev, id]));
    };

    const visible = borrowedBooks.filter(b => !returnedIds.has(b.id));

    return (
        <div className="borrowed-books">
            {visible.map((book, index) => (
                <BorrowedBookRow
                    key={book.id}
                    book={book}
                    index={index}
                    onReturned={handleReturned}
                />
            ))}
        </div>
    );
};

export default BorrowedBooks;
