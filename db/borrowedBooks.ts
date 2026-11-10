import '@/app/lib/neon-local';
import { neon } from '@neondatabase/serverless';
import { pool } from '../src/app/lib/db';
import { BorrowedBook, ReturnedBook } from '../types/BorrowedBook';

export const getBorrowedBooks = async (userId: number): Promise<BorrowedBook[]> => {
    const sql = neon(`${process.env.DATABASE_URL}`);

    const rows = await sql`SELECT b.id, b.title, b.authors, bb.borrowed_at
        FROM borrowed_books bb
        JOIN book_copies bc ON bb.book_copy_id = bc.id
        JOIN books b ON bc.book_id = b.id
        WHERE bb.user_id = ${userId} AND bb.returned_at IS NULL
        ORDER BY bb.borrowed_at DESC;
    `;

    return rows.map(row => ({
        id: row.id,
        title: row.title,
        authors: row.authors,
        borrowedDate: row.borrowed_at
    }));
}

export const getReturnedBooks = async (userId: number): Promise<ReturnedBook[]> => {
    const sql = neon(`${process.env.DATABASE_URL}`);

    const rows = await sql`SELECT bb.id, b.title, b.authors, bb.borrowed_at, bb.returned_at
        FROM borrowed_books bb
        JOIN book_copies bc ON bb.book_copy_id = bc.id
        JOIN books b ON bc.book_id = b.id
        WHERE bb.user_id = ${userId} AND bb.returned_at IS NOT NULL
        ORDER BY bb.returned_at DESC;
    `;

    return rows.map(row => ({
        id: row.id,
        title: row.title,
        authors: row.authors,
        borrowedDate: new Date(row.borrowed_at).toISOString(),
        returnedDate: new Date(row.returned_at).toISOString()
    }));
}

export const checkBookCopyAvailability = async (qrCode: string): Promise<{ available: boolean; }> => {
    const sql = neon(`${process.env.DATABASE_URL}`);

    try {
        const result = await sql`
            SELECT bc.borrowed
            FROM book_copies bc
            WHERE bc.qr_code = ${qrCode}
            LIMIT 1
        `;

        // No row means an unknown code, which is never available.
        const copy = result[0];
        return { available: !!copy && !copy.borrowed };
    } catch (error) {
        // Stryker disable next-line all: logging only
        console.error('Error checking book copy availability:', error);
        return { available: false };
    }
};

type BorrowBookResponse = {
    success: boolean;
    message: string;
    borrowedBookId?: number;
}

export const borrowBook = async (userId: number, qrCode: string): Promise<BorrowBookResponse> => {
    const client = await pool.connect();

    try {
        // Start transaction
        await client.query('BEGIN');

        // 1. Check if the book copy exists and is not already borrowed
        const copyResult = await client.query(`
            SELECT bc.id, bc.book_id, bc.borrowed, b.title 
            FROM book_copies bc
            JOIN books b ON bc.book_id = b.id
            WHERE bc.qr_code = $1
            FOR UPDATE OF bc
        `, [qrCode]);

        if (copyResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'Book copy not found' };
        }

        const bookCopy = copyResult.rows[0];

        if (bookCopy.borrowed) {
            await client.query('ROLLBACK');
            return { success: false, message: 'Book copy is already borrowed' };
        }

        // 2. Create entry in borrowed_books table
        const borrowResult = await client.query(`
            INSERT INTO borrowed_books (book_copy_id, user_id, borrowed_at)
            VALUES ($1, $2, CURRENT_TIMESTAMP)
            RETURNING id
        `, [bookCopy.id, userId]);

        const borrowedBookId = borrowResult.rows[0].id;

        // book_copies.borrowed (and books.borrowed_count) are maintained by triggers on borrowed_books.

        // Commit transaction
        await client.query('COMMIT');

        return {
            success: true,
            message: `Successfully borrowed "${bookCopy.title}"`,
            borrowedBookId
        };

    } catch (error) {
        // Rollback transaction on error
        await client.query('ROLLBACK');
        // Stryker disable next-line all: logging only
        console.error('Error borrowing book:', error);
        return {
            success: false,
            message: 'Failed to borrow book. Please try again.'
        };
    } finally {
        // Release the client back to the pool
        client.release();
    }
};

export const returnBook = async (userId: number, barcode: string): Promise<{ success: boolean; message: string }> => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Check if the book copy exists
        const copyResult = await client.query(`
            SELECT id, book_id, borrowed 
            FROM book_copies 
            WHERE qr_code = $1
            LIMIT 1
            FOR UPDATE
        `, [barcode]);

        if (copyResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'Book copy not found' };
        }

        const bookCopy = copyResult.rows[0];

        if (!bookCopy.borrowed) {
            await client.query('ROLLBACK');
            return { success: false, message: 'Book copy is not borrowed' };
        }

        // 2. Update borrowed_books table
        // Only the user's open loan can be closed. (Matching an already-returned loan used to report
        // success to someone who had returned the copy earlier while another person now held it.)
        const updateBorrowedResult = await client.query(`
            UPDATE borrowed_books
            SET returned_at = CURRENT_TIMESTAMP
            WHERE book_copy_id = $1 AND user_id = $2 AND returned_at IS NULL
            RETURNING id
        `, [bookCopy.id, userId]);

        if (updateBorrowedResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'You have not borrowed this book' };
        }

        // book_copies.borrowed (and books.borrowed_count) are maintained by triggers on borrowed_books.

        await client.query('COMMIT');
        return { success: true, message: 'Book returned successfully' };

    } catch (error) {
        await client.query('ROLLBACK');
        // Stryker disable next-line all: logging only
        console.error('Error returning book:', error);
        return { success: false, message: 'Failed to return book. Please try again.' };
    } finally {
        client.release();
    }
}