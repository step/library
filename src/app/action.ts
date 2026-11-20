import { revalidateTag, unstable_cache } from "next/cache";
import { getBooks } from "../../db/books";
import { Book } from "@/types/Book";

/**
 * A page of the catalogue, from the data cache. Writes that change what the catalogue shows
 * (borrow, return, add book, rating) call invalidateBooksCache.
 */
export const loadBooksWithSearch = unstable_cache(
    async (searchQuery: string, lastSeenId?: string, size: number = 20): Promise<Book[]> =>
        getBooks(searchQuery, size, lastSeenId),
    ['books-search'],
    {
        tags: ['books'],
        revalidate: 300, // Cache for 5 minutes
    }
);

// Expires the cached catalogue straight away, so the next read shows the new counts.
// ('max' would serve the old counts once more while refreshing in the background.)
export const invalidateBooksCache = async () => {
    revalidateTag('books', { expire: 0 });
};
