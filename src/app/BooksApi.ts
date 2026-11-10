import { invalidateBooksCache } from "./action";

export const borrowBook = async (barcode: string) => {
    try {
        const response = await fetch("/api/books/borrow", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ barcode }),
        });

        const body = await response.json();
        
        // Invalidate cache after successful borrow operation
        if (response.ok) {
            await invalidateBooksCache();
        }
        
        return { success: response.ok, data: body };
    } catch (error) {
        // Stryker disable next-line all: logging only
        console.error("Error borrowing book:", error);
        return { success: false, data: { message: "Failed to borrow book. Please try again." } };
    }
}

export const loadBooksAfter = async (searchQuery: string, lastSeenBookId: number, size: number = 20) => {
    try {
        const search = `search=${encodeURIComponent(searchQuery)}`
        const response = await fetch(`/api/books?lastSeenId=${lastSeenBookId}&size=${size}&${search}`);
        const body = await response.json();
        return { success: response.ok, data: body };
    } catch {
        return { success: false, data: { message: "Failed to load books. Please try again." } };
    }
}

export const returnBook = async (barcode: string) => {
    try {
        const response = await fetch("/api/books/return", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ barcode }),
        });

        const body = await response.json();
        
        // Invalidate cache after successful return operation
        if (response.ok) {
            await invalidateBooksCache();
        }
        
        return { success: response.ok, data: body };
    } catch (error) {
        // Stryker disable next-line all: logging only
        console.error("Error returning book:", error);
        return { success: false, data: { message: "Failed to return book. Please try again." } };
    }
}