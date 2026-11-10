import { useState, useCallback, useEffect, useRef } from 'react';
import { loadBooksAfter } from '@/app/BooksApi';
import { Book } from '../types/Book';
import { useDebounce } from './useDebounce';

interface UseBookSearchOptions {
    initialBooks: Book[];
    debounceDelay?: number;
}

interface UseBookSearchResult {
    books: Book[];
    searchQuery: string;
    isSearching: boolean;
    loadingMore: boolean;
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
    // Not state: it is never rendered, and changing it must not re-run the search effect.
    const searchCache = useRef<Map<string, Book[]>>(new Map([['', initialBooks]]));
    // Id of the newest search. Older responses that arrive late must not overwrite newer results.
    const latestSearch = useRef(0);
    
    const debouncedSearchQuery = useDebounce(searchQuery, debounceDelay);

    const performSearch = useCallback(async (query: string, useCache: boolean = true) => {
        const searchId = ++latestSearch.current;

        if (useCache && searchCache.current.has(query)) {
            setBooks(searchCache.current.get(query) || []);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        try {
            const { success, data } = await loadBooksAfter(query, 0, 20);
            if (success && Array.isArray(data)) {
                searchCache.current.set(query, data);
                if (searchId === latestSearch.current) setBooks(data);
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
            const { success, data } = await loadBooksAfter(searchQuery, lastSeenBookId, 20);
            if (success && data.length > 0) {
                setBooks(prevBooks => [...prevBooks, ...data]);
                
                // Update cache for current search query
                if (searchQuery && searchCache.current.has(searchQuery)) {
                    const existing = searchCache.current.get(searchQuery) || [];
                    searchCache.current.set(searchQuery, [...existing, ...data]);
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
        setSearchQuery,
        performSearch,
        loadMore
    };
};
