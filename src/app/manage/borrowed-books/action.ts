"use server";
import { BorrowedBookWithUser } from '@/types/BorrowedBook';
import { neon } from '@neondatabase/serverless';
import { pool } from '../../lib/db';
import { revalidatePath } from 'next/cache';
import { invalidateBooksCache } from '../../action';
import { getLoggedInUser } from '../../../../db/user';

// Server actions are callable directly over HTTP, so each one enforces admin access itself.
const requireAdmin = async () => {
    const user = await getLoggedInUser();
    if (!user || !user.isAdmin) {
        throw new Error('Access denied: administrators only');
    }
};

export const getAllBorrowedBooks = async (): Promise<BorrowedBookWithUser[]> => {
    await requireAdmin();
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
    borrowedBookId: number
): Promise<{ success: boolean; message: string }> => {
    try {
        await requireAdmin();
    } catch {
        return { success: false, message: 'Only administrators can return books for others' };
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Mark the borrow record as returned (preserve existing returned_at if already set)
        await client.query(`
            UPDATE borrowed_books
            SET returned_at = COALESCE(returned_at, CURRENT_TIMESTAMP)
            WHERE id = $1
        `, [borrowedBookId]);

        // book_copies.borrowed and books.borrowed_count are maintained by triggers on borrowed_books.

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