"use server";
import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { neon } from "@neondatabase/serverless";
import { Book } from "@/types/Book";

// Cached version of loadBooks with React cache for request deduplication
export const loadBooks = cache(async (): Promise<Book[]> => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    const rows = await sql`SELECT * FROM books ORDER BY id ASC LIMIT 20`;

    return rows.map(row => ({
        id: row.id,
        title: row.title,
        authors: row.authors,
        isbn10: row.isbn10,
        isbn13: row.isbn13,
        count: row.count,
        borrowedCount: row.borrowed_count,
    }));
});

// Cached version for search queries with Next.js unstable_cache for persistence
export const loadBooksWithSearch = unstable_cache(
    async (searchQuery: string, lastSeenId?: string, size: number = 20): Promise<Book[]> => {
        const sql = neon(`${process.env.DATABASE_URL}`);
        
        let query;
        if (lastSeenId) {
            query = searchQuery.trim()
                ? sql`
                    SELECT 
                        id,
                        title,
                        authors,
                        isbn10,
                        isbn13,
                        count,
                        borrowed_count as "borrowedCount"
                    FROM books 
                    WHERE id > ${parseInt(lastSeenId)} AND title ILIKE ${'%' + searchQuery + '%'}
                    ORDER BY id 
                    LIMIT ${size}
                `
                : sql`
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
        } else {
            query = searchQuery.trim()
                ? sql`
                    SELECT 
                        id,
                        title,
                        authors,
                        isbn10,
                        isbn13,
                        count,
                        borrowed_count as "borrowedCount"
                    FROM books 
                    WHERE title ILIKE ${'%' + searchQuery + '%'}
                    ORDER BY id 
                    LIMIT ${size}
                `
                : sql`
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
        }
        
        const rows = await query;
        return rows as Book[];
    },
    ['books-search'],
    {
        tags: ['books'],
        revalidate: 300, // Cache for 5 minutes
    }
);

// Cache invalidation function for book operations
export const invalidateBooksCache = async () => {
    revalidateTag('books', 'max');
};