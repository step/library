import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { pool } from '../src/app/lib/db';
import { BorrowedBook } from '../types/BorrowedBook';
import { BookCopy } from '../types/Book';

type SQL = NeonQueryFunction<false, false>;

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

export const checkBookCopyAvailability = async (qrCode: string): Promise<{ available: boolean; }> => {
    const sql = neon(`${process.env.DATABASE_URL}`);

    try {
        const result = await sql`
            SELECT bc.borrowed
            FROM book_copies bc
            WHERE bc.qr_code = ${qrCode}
            LIMIT 1
        `;

        if (result.length === 0) {
            return { available: false };
        }

        const bookCopy = result[0];
        return { available: !bookCopy.borrowed };
    } catch (error) {
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

        // 3. Update book_copies table to mark as borrowed
        await client.query(`
            UPDATE book_copies 
            SET borrowed = TRUE 
            WHERE id = $1
        `, [bookCopy.id]);

        // 4. Update books table to increment borrowed_count
        await client.query(`
            UPDATE books 
            SET borrowed_count = borrowed_count + 1 
            WHERE id = $1
        `, [bookCopy.book_id]);

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

const getBookCopyByQRCode = async (sql: SQL, qrCode: string): Promise<BookCopy | null> => {
    const result = await sql`
        SELECT id, book_id, borrowed FROM book_copies WHERE qr_code = ${qrCode} LIMIT 1;
    `;
    if (result.length === 0) {
        return null;
    }
    const row = result[0];
    return {
        id: row.id,
        bookId: row.book_id,
        qrCode: qrCode,
        borrowed: row.borrowed
    }
}

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
        const updateBorrowedResult = await client.query(`
            UPDATE borrowed_books
            SET returned_at = COALESCE(returned_at, CURRENT_TIMESTAMP)
            WHERE book_copy_id = $1 AND user_id = $2
              AND id = (
                SELECT id FROM borrowed_books
                WHERE book_copy_id = $1 AND user_id = $2
                ORDER BY borrowed_at DESC
                LIMIT 1
              )
            RETURNING id
        `, [bookCopy.id, userId]);

        if (updateBorrowedResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'You have not borrowed this book' };
        }

        // 3. Update book_copies table
        await client.query(`
            UPDATE book_copies
            SET borrowed = FALSE
            WHERE id = $1
        `, [bookCopy.id]);

        // 4. Update books table
        await client.query(`
            UPDATE books
            SET borrowed_count = borrowed_count - 1
            WHERE id = $1
        `, [bookCopy.book_id]);

        await client.query('COMMIT');
        return { success: true, message: 'Book returned successfully' };

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error returning book:', error);
        return { success: false, message: 'Failed to return book. Please try again.' };
    } finally {
        client.release();
    }
}