export type Book = {
    id: number;
    title: string;
    authors: string;
    isbn10?: string;
    isbn13?: string;
    count: number;
    borrowedCount: number;
    /** Number of readers who rated the book. */
    ratingCount: number;
    /** Average rating to one decimal place, or null when nobody has rated the book. */
    ratingAverage: number | null;
};

/** The book a reader just returned, with the rating they gave it before (if any). */
export type ReturnedBookInfo = {
    id: number;
    title: string;
    authors: string;
    myRating: number | null;
};

export type BookCopy = {
    id: number;
    bookId: number;
    qrCode: string;
    borrowed: boolean;
};