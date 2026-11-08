"use client";
import React, { useCallback, Suspense, useMemo } from 'react';
import { Lexend } from 'next/font/google';
import "../styles/Books.css";
import { Book } from '../types/Book';
import Searchbar from './Searchbar';
import AsyncSearchResults from './AsyncSearchResults';
import BookListSkeleton from './BookListSkeleton';
import { useBookSearch, useVirtualScroll } from '../hooks';

const lexend = Lexend({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-lexend' });

interface BooksProps {
    books: Book[];
}

/**
 * Main Books component that handles book display, search, and virtualization
 * Optimized with memoization and Suspense boundaries for better performance
 */
const Books: React.FC<BooksProps> = ({ books: initialBooks }) => {
    const {
        books,
        searchQuery,
        isSearching,
        loadingMore,
        setSearchQuery,
        performSearch,
        loadMore
    } = useBookSearch({ 
        initialBooks 
    });

    const { lastScrollPosition, handleScroll } = useVirtualScroll();

    // Memoize expensive callback functions to prevent child re-renders
    const handleSearch = useCallback(() => {
        performSearch(searchQuery, false); // Force fresh search when explicitly requested
    }, [performSearch, searchQuery]);

    const handleEndReached = useCallback(async () => {
        if (books.length > 0) {
            await loadMore(searchQuery, books[books.length - 1].id);
        }
    }, [loadMore, searchQuery, books]);

    // Memoize props object to prevent unnecessary re-renders
    const asyncSearchResultsProps = useMemo(() => ({
        books,
        isSearching,
        searchQuery,
        lastScrollPosition,
        loadingMore,
        onScroll: handleScroll,
        onEndReached: handleEndReached
    }), [
        books,
        isSearching,
        searchQuery,
        lastScrollPosition,
        loadingMore,
        handleScroll,
        handleEndReached
    ]);

    const clearSearch = useCallback(() => setSearchQuery(''), [setSearchQuery]);
    const noResults = !isSearching && books.length === 0;

    return (
        <div className={`bk-page ${lexend.variable}`}>
            <h1 className="bk-h1">Books</h1>
            <p className="bk-sub">Browse everything in the library.</p>
            <Searchbar 
                value={searchQuery} 
                onChange={setSearchQuery} 
                onSearch={handleSearch}
                isLoading={isSearching}
            />
            {noResults ? (
                <div className="bk-empty">
                    <p className="bk-empty-t">No books match your search</p>
                    <p className="bk-empty-s">Try a different title or author.</p>
                    <button className="bk-btn-outline" onClick={clearSearch}>Clear search</button>
                </div>
            ) : (
                <div className="bk-table">
                    <div className="bk-thead" aria-hidden="true">
                        <span>Title and author</span><span>Total</span><span>Borrowed</span><span>Available</span>
                    </div>
                    <div className="bk-scroll">
                        <Suspense fallback={<BookListSkeleton count={8} />}>
                            <AsyncSearchResults {...asyncSearchResultsProps} />
                        </Suspense>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Books;
