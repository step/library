import React, { useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Book } from '../types/Book';
import BookRow from './BookRow';
import { LoadingFooter } from './LoadingFooter';

interface VirtualizedBookListProps {
    books: Book[];
    loadingMore: boolean;
    onEndReached: () => Promise<void>;
}

/**
 * Virtualized list component for displaying books
 */
export const VirtualizedBookList: React.FC<VirtualizedBookListProps> = React.memo(({
    books,
    loadingMore,
    onEndReached
}) => {
    const handleEndReached = useCallback(async () => {
        if (loadingMore || books.length === 0) return;
        await onEndReached();
    }, [loadingMore, books.length, onEndReached]);

    const renderItem = useCallback((_index: number, book: Book) => (
        <BookRow key={book.id} book={book} />
    ), []);

    return (
        <Virtuoso
            style={{ height: "100%" }}
            data={books}
            endReached={handleEndReached}
            context={{ loadingMore }}
            components={{ Footer: LoadingFooter }}
            itemContent={renderItem}
        />
    );
});

VirtualizedBookList.displayName = 'VirtualizedBookList';