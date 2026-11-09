import BackLink from "@/components/manage/BackLink";
import { getAllBorrowedBooks } from "./action";
import BorrowedBooks from "./BorrowedBooks";

const BorrowedBooksPage = async () => {
    const borrowedBooks = await getAllBorrowedBooks();

    return (
        <>
            <BackLink />
            <h1 className="mg-h1">Borrowed books</h1>
            <p className="mg-sub">Every book that is out right now, and who has it.</p>
            <BorrowedBooks borrowedBooks={borrowedBooks} />
        </>
    )
}

export default BorrowedBooksPage;
