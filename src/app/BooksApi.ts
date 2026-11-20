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
        return { success: response.ok, data: body };
    } catch (error) {
        // Stryker disable next-line all: logging only
        console.error("Error returning book:", error);
        return { success: false, data: { message: "Failed to return book. Please try again." } };
    }
}

/** Why a rating request failed: no connection, or the server could not do it. */
export type RatingFailure = "offline" | "server";
export type RatingResult = { success: true } | { success: false; reason: RatingFailure };

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

const sendRating = async (bookId: number, init: RequestInit): Promise<RatingResult> => {
    if (isOffline()) return { success: false, reason: "offline" };
    try {
        const response = await fetch(`/api/ratings/${bookId}`, init);
        return response.ok ? { success: true } : { success: false, reason: "server" };
    } catch (error) {
        // Stryker disable next-line all: logging only
        console.error("Error sending rating:", error);
        // fetch only throws when the request never got an answer: treat it as a lost connection.
        return { success: false, reason: "offline" };
    }
};

export const saveRating = (bookId: number, rating: number) =>
    sendRating(bookId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
    });

export const removeRating = (bookId: number) => sendRating(bookId, { method: "DELETE" });
