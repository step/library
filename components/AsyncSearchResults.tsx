import React, { Suspense, memo } from 'react';
import { Book } from '../types/Book';
import AsyncBookList from './AsyncBookList';
import BookListSkeleton from './BookListSkeleton';

interface AsyncSearchResultsProps {
    books: Book[];
    isSearching: boolean;
    searchQuery: string;
    lastScrollPosition: number;
    loadingMore: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onScroll: (event: any) => void;
    onEndReached: () => Promise<void>;
}

/**
 * Async wrapper for search results with Suspense boundaries
 * Provides optimized loading states for search operations
 * Memoized to prevent unnecessary re-renders
 */
export const AsyncSearchResults: React.FC<AsyncSearchResultsProps> = memo(({
    books,
    isSearching,
    lastScrollPosition,
    loadingMore,
    onScroll,
    onEndReached
}) => {
    // Show search skeleton when actively searching with no results
    if (isSearching && books.length === 0) {
        return <BookListSkeleton count={6} />;
    }

    // Show results with Suspense boundary
    return (
        <Suspense fallback={<BookListSkeleton count={6} />}>
            <AsyncBookList
                books={books}
                lastScrollPosition={lastScrollPosition}
                loadingMore={loadingMore}
                onScroll={onScroll}
                onEndReached={onEndReached}
                priorityCount={6} // Slightly fewer for search results
            />
        </Suspense>
    );
});

AsyncSearchResults.displayName = 'AsyncSearchResults';

export default AsyncSearchResults;
