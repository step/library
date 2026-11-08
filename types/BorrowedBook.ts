export type BorrowedBook = {
    id: number;
    title: string;
    authors: string;
    borrowedDate: string;
};


export type ReturnedBook = BorrowedBook & {
    returnedDate: string;
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