import '@/app/lib/neon-local';
import { neon, NeonQueryFunction } from '@neondatabase/serverless';
import { containsPattern } from '../src/app/lib/like';
import { Book } from '../types/Book';
import { OnboardBookReqBody } from '../types/OnboardBookReqBody';

type SQL = NeonQueryFunction<false, false>;

const getBooksFirstPage = async (sql: SQL, searchQuery: string, size: number): Promise<Book[]> => {
    const books = searchQuery.trim() 
        ? await sql`
            SELECT 
                id,
                title,
                authors,
                isbn10,
                isbn13,
                count,
                borrowed_count as "borrowedCount"
            FROM books 
            WHERE title ILIKE ${containsPattern(searchQuery)}
            ORDER BY id 
            LIMIT ${size}
        `
        : await sql`
            SELECT 
                id,
                title,
                authors,
                isbn10,
                isbn13,
                count,
                borrowed_count as "borrowedCount"
            FROM books 
            ORDER BY id 
            LIMIT ${size}
        `;
    return books as Book[];
};

const getBooksAfterCursor = async (sql: SQL, searchQuery: string, size: number, lastSeenId: string): Promise<Book[]> => {
    const books = searchQuery.trim()
        ? await sql`
            SELECT 
                id,
                title,
                authors,
                isbn10,
                isbn13,
                count,
                borrowed_count as "borrowedCount"
            FROM books 
            WHERE id > ${parseInt(lastSeenId)} AND title ILIKE ${containsPattern(searchQuery)}
            ORDER BY id 
            LIMIT ${size}
        `
        : await sql`
            SELECT 
                id,
                title,
                authors,
                isbn10,
                isbn13,
                count,
                borrowed_count as "borrowedCount"
            FROM books 
            WHERE id > ${parseInt(lastSeenId)}
            ORDER BY id 
            LIMIT ${size}
        `;
    return books as Book[];
};

export const getBooks = async (searchQuery: string, size: number, lastSeenId?: string): Promise<Book[]> => {
    const sql = neon(`${process.env.DATABASE_URL}`);

    return lastSeenId
        ? await getBooksAfterCursor(sql, searchQuery, size, lastSeenId)
        : await getBooksFirstPage(sql, searchQuery, size);
}

const findExistingBookId = async (sql: SQL, isbn10?: string, isbn13?: string): Promise<number | undefined> => {
    // Either ISBN identifies the book: a reprint may carry a new ISBN 10 but the same ISBN 13.
    const rows = await sql`
        SELECT id FROM books
        WHERE (${isbn10 ?? null}::text IS NOT NULL AND isbn10 = ${isbn10 ?? null})
           OR (${isbn13 ?? null}::text IS NOT NULL AND isbn13 = ${isbn13 ?? null})
        ORDER BY id
        LIMIT 1
    `;
    return rows[0]?.id;
}

const createBook = async (sql: SQL, req: OnboardBookReqBody): Promise<number> => {
    const { title, authors, isbn10, isbn13 } = req;
    const result = await sql`
        INSERT INTO books (title, authors, isbn10, isbn13)
        VALUES (${title}, ${authors}, ${isbn10}, ${isbn13})
        RETURNING id
    `;
    return result[0].id;
}

const addCopies = async (sql: SQL, bookId: number, copies: string[]) => {
    for (const copy of copies) {
        await sql`
            INSERT INTO book_copies (book_id, qr_code)
            VALUES (${bookId}, ${copy})
            ON CONFLICT (qr_code) DO NOTHING
        `;
    }
    // books.count is maintained by the sync_book_counts trigger on book_copies,
    // so copies skipped by ON CONFLICT are not counted.
}

const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === '23505';

export const onboardBook = async (req: OnboardBookReqBody) => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    let bookId = await findExistingBookId(sql, req.isbn10, req.isbn13);
    if (bookId === undefined) {
        try {
            bookId = await createBook(sql, req);
        } catch (error) {
            // Someone else created the same book between our lookup and our insert: use theirs.
            if (!isUniqueViolation(error)) throw error;
            bookId = await findExistingBookId(sql, req.isbn10, req.isbn13);
            if (bookId === undefined) throw error;
        }
    }

    await addCopies(sql, bookId, req.copies);
}
