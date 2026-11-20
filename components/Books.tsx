"use client";
import React, { useCallback } from 'react';
import { lexend } from '../src/app/lib/fonts';
import "../styles/Books.css";
import { Book } from '../types/Book';
import Searchbar from './Searchbar';
import { VirtualizedBookList } from './VirtualizedBookList';
import BookListSkeleton from './BookListSkeleton';
import { useBookSearch } from '../hooks';

interface BooksProps {
    books: Book[];
}

/** The catalogue: search box and a virtualised list of books that loads more as you scroll. */
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

    // Memoize expensive callback functions to prevent child re-renders
    const handleSearch = useCallback(() => {
        performSearch(searchQuery, false); // Force fresh search when explicitly requested
    }, [performSearch, searchQuery]);

    const handleEndReached = useCallback(async () => {
        if (books.length > 0) {
            await loadMore(searchQuery, books[books.length - 1].id);
        }
    }, [loadMore, searchQuery, books]);

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
                        {/* A search that started from an empty list has nothing to show yet. */}
                        {isSearching && books.length === 0 ? (
                            <BookListSkeleton count={6} />
                        ) : (
                            <VirtualizedBookList
                                books={books}
                                loadingMore={loadingMore}
                                onEndReached={handleEndReached}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Books;
