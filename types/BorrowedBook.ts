export type BorrowedBook = {
    id: number;
    title: string;
    authors: string;
    borrowedDate: string;
};


/** One returned loan. `id` is the loan id; `bookId` is the book. */
export type ReturnedBook = BorrowedBook & {
    bookId: number;
    returnedDate: string;
    /** The reader's rating of the book (shared by every loan of the same book), or null. */
    rating: number | null;
};

export type BorrowedBookWithUser = {
    id: number;
    title: string;
    authors: string;
    borrowedDate: string;
    borrowerName: string;
    borrowerEmail: string;
    bookCopyId: number;
    qrCode: string;
};