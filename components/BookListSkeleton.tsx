import React from 'react';
import BookRowSkeleton from './BookRowSkeleton';

interface BookListSkeletonProps {
    /** Number of skeleton rows to display */
    count?: number;
    /** Additional CSS class name */
    className?: string;
}

/**
 * Skeleton loader for the entire book list
 * Shows multiple BookRowSkeleton components to simulate loading state
 */
const BookListSkeleton: React.FC<BookListSkeletonProps> = ({ 
    count = 6, 
    className = '' 
}) => {
    return (
        <div className={className}>
            {Array.from({ length: count }, (_, index) => (
                <BookRowSkeleton key={`skeleton-${index}`} />
            ))}
        </div>
    );
};

export default BookListSkeleton;
