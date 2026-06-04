"use server";
import { BorrowedBookWithUser } from '@/types/BorrowedBook';
import { neon } from '@neondatabase/serverless';
import { pool } from '../../lib/db';
import { revalidatePath } from 'next/cache';
import { invalidateBooksCache } from '../../action';

export const getAllBorrowedBooks = async (): Promise<BorrowedBookWithUser[]> => {
    const sql = neon(`${process.env.DATABASE_URL}`);

    // Optimized query with proper joins and indexes
    const rows = await sql`
        SELECT 
            bb.id,
            b.title,
            b.authors,
            bb.borrowed_at as "borrowedAt",
            u.name as "borrowerName",
            u.email as "borrowerEmail",
            bb.book_copy_id as "bookCopyId",
            bc.qr_code as "qrCode"
        FROM borrowed_books bb
        INNER JOIN book_copies bc ON bb.book_copy_id = bc.id
        INNER JOIN books b ON bc.book_id = b.id
        INNER JOIN library_users u ON bb.user_id = u.id
        WHERE bb.returned_at IS NULL
        ORDER BY bb.borrowed_at DESC;
    `;

    return rows.map(row => ({
        id: row.id,
        title: row.title,
        authors: row.authors,
        borrowedDate: row.borrowedAt,
        borrowerName: row.borrowerName,
        borrowerEmail: row.borrowerEmail,
        bookCopyId: row.bookCopyId,
        qrCode: row.qrCode
    }));
}

export const forceReturnBook = async (
    borrowedBookId: number,
    bookCopyId: number
): Promise<{ success: boolean; message: string }> => {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Mark the borrow record as returned (preserve existing returned_at if already set)
        await client.query(`
            UPDATE borrowed_books
            SET returned_at = COALESCE(returned_at, CURRENT_TIMESTAMP)
            WHERE id = $1
        `, [borrowedBookId]);

        // Flip the copy to not-borrowed; only decrement borrowed_count if it was actually borrowed
        const copyResult = await client.query(`
            UPDATE book_copies
            SET borrowed = FALSE
            WHERE id = $1 AND borrowed = TRUE
            RETURNING book_id
        `, [bookCopyId]);

        if (copyResult.rows.length > 0) {
            await client.query(`
                UPDATE books
                SET borrowed_count = GREATEST(borrowed_count - 1, 0)
                WHERE id = $1
            `, [copyResult.rows[0].book_id]);
        }

        await client.query('COMMIT');

        revalidatePath('/manage/borrowed-books');
        await invalidateBooksCache();

        return { success: true, message: 'Book marked as returned successfully' };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error force returning book:', error);
        return { success: false, message: 'Failed to mark book as returned' };
    } finally {
        client.release();
    }
};