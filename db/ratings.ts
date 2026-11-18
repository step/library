import '@/app/lib/neon-local';
import { neon } from '@neondatabase/serverless';

export type SaveRatingResult = 'saved' | 'book-not-found' | 'not-returned';

const isForeignKeyViolation = (error: unknown) => (error as { code?: string })?.code === '23503';

/**
 * Saves the reader's rating of a book, replacing any earlier rating of the same book.
 * Only a reader who has returned at least one copy of the book may rate it. The check and the
 * write are one statement, so a loan or book changing in between cannot slip through.
 * books.rating_count / rating_sum follow via the sync_book_rating_totals trigger.
 * The caller must pass a valid rating (1 to 5); the database rejects anything else.
 */
export const saveRating = async (userId: number, bookId: number, rating: number): Promise<SaveRatingResult> => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    try {
        const [row] = await sql`
            WITH saved AS (
                INSERT INTO book_ratings (user_id, book_id, rating)
                SELECT ${userId}::int, ${bookId}::int, ${rating}::smallint
                WHERE EXISTS (
                    SELECT 1
                    FROM borrowed_books bb
                    JOIN book_copies bc ON bc.id = bb.book_copy_id
                    WHERE bb.user_id = ${userId} AND bc.book_id = ${bookId} AND bb.returned_at IS NOT NULL
                )
                ON CONFLICT (user_id, book_id)
                DO UPDATE SET rating = EXCLUDED.rating, updated_at = CURRENT_TIMESTAMP
                RETURNING 1
            )
            SELECT
                EXISTS (SELECT 1 FROM saved) AS saved,
                EXISTS (SELECT 1 FROM books WHERE id = ${bookId}) AS book_exists
        `;
        if (row.saved) return 'saved';
        return row.book_exists ? 'not-returned' : 'book-not-found';
    } catch (error) {
        // The book was deleted between the check and the insert.
        if (isForeignKeyViolation(error)) return 'book-not-found';
        throw error;
    }
};

/** Removes the reader's rating of a book. Removing a rating that does not exist is not an error. */
export const deleteRating = async (userId: number, bookId: number): Promise<void> => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    await sql`DELETE FROM book_ratings WHERE user_id = ${userId} AND book_id = ${bookId}`;
};
