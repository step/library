import React from 'react';
import '../styles/BookRowSkeleton.css';

/**
 * Skeleton loader that mimics the BookRow layout
 */
const BookRowSkeleton: React.FC = () => {
    return (
        <div className="bk-row" aria-hidden="true">
            <div className="bk-ttl">
                <span className="skeleton bk-skel bk-skel-t" />
                <span className="skeleton bk-skel bk-skel-a" />
            </div>
            {[0, 1, 2].map((i) => (
                <div className="bk-stat" key={i}>
                    <span className="skeleton bk-skel bk-skel-n" />
                </div>
            ))}
        </div>
    );
};

export default BookRowSkeleton;
