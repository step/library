import { useState, useCallback, useEffect, useRef } from 'react';
import { loadBooksAfter } from '@/app/BooksApi';
import { Book } from '../types/Book';
import { useDebounce } from './useDebounce';

/** Books per request. A shorter page means there are no more books to load. */
const PAGE_SIZE = 20;
const isFullPage = (page: Book[]) => page.length === PAGE_SIZE;

type CacheEntry = { books: Book[]; hasMore: boolean };

interface UseBookSearchOptions {
    initialBooks: Book[];
    debounceDelay?: number;
}

interface UseBookSearchResult {
    books: Book[];
    searchQuery: string;
    isSearching: boolean;
    loadingMore: boolean;
    /** False once a page came back short: scrolling to the end should not ask for more. */
    hasMore: boolean;
    setSearchQuery: (query: string) => void;
    performSearch: (query: string, useCache?: boolean) => Promise<void>;
    loadMore: (query: string, lastSeenBookId: number) => Promise<void>;
}

/**
 * Custom hook for managing book search functionality
 */
export const useBookSearch = ({ 
    initialBooks, 
    debounceDelay = 300 
}: UseBookSearchOptions): UseBookSearchResult => {
    const [books, setBooks] = useState<Book[]>(initialBooks);
    const [searchQuery, setSearchQuery] = useState("");
    const [loadingMore, setLoadingMore] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [hasMore, setHasMore] = useState(isFullPage(initialBooks));
    // Not state: it is never rendered, and changing it must not re-run the search effect.
    const searchCache = useRef<Map<string, CacheEntry>>(
        new Map([['', { books: initialBooks, hasMore: isFullPage(initialBooks) }]])
    );
    // Id of the newest search. Older responses that arrive late must not overwrite newer results.
    const latestSearch = useRef(0);
    
    const debouncedSearchQuery = useDebounce(searchQuery, debounceDelay);

    const performSearch = useCallback(async (query: string, useCache: boolean = true) => {
        const searchId = ++latestSearch.current;

        const cached = useCache ? searchCache.current.get(query) : undefined;
        if (cached) {
            setBooks(cached.books);
            setHasMore(cached.hasMore);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        try {
            const { success, data } = await loadBooksAfter(query, 0, PAGE_SIZE);
            if (success && Array.isArray(data)) {
                const entry = { books: data, hasMore: isFullPage(data) };
                searchCache.current.set(query, entry);
                if (searchId === latestSearch.current) {
                    setBooks(entry.books);
                    setHasMore(entry.hasMore);
                }
            }
        } catch {
            // Keep showing the previous results.
        } finally {
            if (searchId === latestSearch.current) setIsSearching(false);
        }
    }, []);

    const loadMore = useCallback(async (searchQuery: string, lastSeenBookId: number) => {
        if (loadingMore) return;
        
        setLoadingMore(true);
        try {
            const { success, data } = await loadBooksAfter(searchQuery, lastSeenBookId, PAGE_SIZE);
            if (success && Array.isArray(data)) {
                const more = isFullPage(data);
                setHasMore(more);
                if (data.length > 0) setBooks(prevBooks => [...prevBooks, ...data]);

                // Update cache for current search query
                const existing = searchQuery ? searchCache.current.get(searchQuery) : undefined;
                if (existing) {
                    searchCache.current.set(searchQuery, { books: [...existing.books, ...data], hasMore: more });
                }
            }
        } catch (error) {
            // Stryker disable next-line all: logging only
            console.error('Load more failed:', error);
        } finally {
            setLoadingMore(false);
        }
    }, [loadingMore]);

    // Effect for debounced search
    useEffect(() => {
        if (debouncedSearchQuery !== searchQuery) return;
        performSearch(debouncedSearchQuery);
    }, [debouncedSearchQuery, performSearch]);

    return {
        books,
        searchQuery,
        isSearching,
        loadingMore,
        hasMore,
        setSearchQuery,
        performSearch,
        loadMore
    };
};
