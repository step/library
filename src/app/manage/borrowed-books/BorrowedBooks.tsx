"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { BorrowedBookWithUser } from "@/types/BorrowedBook";
import { formatShortDate, formatTimeSince } from "@/utils/dateUtils";
import { forceReturnBook } from "./action";
import { useSnackbar } from "@/utils/useSnackbar";
import Snackbar from "@/components/Snackbar";

const BorrowedBooks = ({ borrowedBooks }: { borrowedBooks: BorrowedBookWithUser[] }) => {
    const [books, setBooks] = useState(borrowedBooks);
    const [query, setQuery] = useState("");
    const [pendingId, setPendingId] = useState<number | null>(null);
    const { snackbar, showSuccess, showError, close } = useSnackbar();

    const q = query.trim().toLowerCase();
    const visible = books.filter(b =>
        !q || `${b.title} ${b.authors} ${b.borrowerName} ${b.borrowerEmail}`.toLowerCase().includes(q)
    );

    const handleReturn = async (book: BorrowedBookWithUser) => {
        if (pendingId !== null) return;
        setPendingId(book.id);
        const result = await forceReturnBook(book.id);
        setPendingId(null);
        if (result.success) {
            setBooks(prev => prev.filter(b => b.id !== book.id));
            showSuccess(result.message);
        } else {
            showError(result.message);
        }
    };

    const countText = q
        ? `${visible.length} of ${books.length} borrowed`
        : `${books.length} ${books.length === 1 ? "book" : "books"} borrowed`;

    return (
        <>
            <label className="mg-search">
                <span className="mg-sr">Search borrowed books</span>
                <Search size={20} aria-hidden="true" />
                <input type="search" placeholder="Search by title, author or person" value={query} onChange={e => setQuery(e.target.value)} />
            </label>
            <p className="mg-count">{countText}</p>

            {visible.length > 0 && (
                <div className="mg-table">
                    <div className="mg-thead mg-cols-borrowed" aria-hidden="true">
                        <span>Title and author</span><span>Borrowed by</span><span>Borrowed on</span><span className="mg-ta-r">Action</span>
                    </div>
                    <ul className="mg-list">
                        {visible.map(book => (
                            <li className="mg-row mg-cols-borrowed" key={book.id}>
                                <div className="mg-ttl">
                                    <div className="mg-t">{book.title}</div>
                                    <div className="mg-a">{book.authors}</div>
                                </div>
                                <div className="mg-stat">
                                    <span className="mg-lbl">Borrowed by</span>
                                    <span className="mg-val">{book.borrowerName}</span>
                                </div>
                                <div className="mg-stat">
                                    <span className="mg-lbl">Borrowed on</span>
                                    <span className="mg-val">{formatShortDate(book.borrowedDate)}</span>
                                    <span className="mg-ago">{formatTimeSince(book.borrowedDate)}</span>
                                </div>
                                <div className="mg-ract">
                                    <button className="mg-btn-sm" disabled={pendingId !== null} aria-label={`Mark ${book.title} as returned`}
                                        onClick={() => handleReturn(book)}>
                                        {pendingId === book.id ? "Updating..." : "Mark returned"}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {visible.length === 0 && (
                <div className="mg-empty">
                    <p className="mg-empty-t">{q ? "No borrowed books match your search" : "No books are currently borrowed"}</p>
                    {q && <button className="mg-btn-outline" onClick={() => setQuery("")}>Clear search</button>}
                </div>
            )}
            <Snackbar isOpen={snackbar.isOpen} message={snackbar.message} type={snackbar.type} onClose={close} />
        </>
    );
};

export default BorrowedBooks;
