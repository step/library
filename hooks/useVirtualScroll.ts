import { useState, useCallback } from 'react';

interface UseVirtualScrollOptions {
    initialScrollPosition?: number;
}

interface UseVirtualScrollResult {
    lastScrollPosition: number;
    handleScroll: (event: { target: unknown }) => void;
}

/**
 * Custom hook for managing virtual scroll state
 */
export const useVirtualScroll = ({ 
    initialScrollPosition = 0 
}: UseVirtualScrollOptions = {}): UseVirtualScrollResult => {
    const [lastScrollPosition, setLastScrollPosition] = useState(initialScrollPosition);

    const handleScroll = useCallback((event: { target: unknown }) => {
        setLastScrollPosition((event.target as HTMLElement).scrollTop);
    }, []);

    return {
        lastScrollPosition,
        handleScroll
    };
};
