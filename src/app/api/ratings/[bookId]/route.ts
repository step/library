import { NextRequest } from "next/server";
import { getLoggedInUser } from "../../../../../db/user";
import { saveRating, deleteRating } from "../../../../../db/ratings";
import { invalidateBooksCache } from "../../../action";
import { isValidRating } from "../../../../../utils/ratings";

type Params = { params: Promise<{ bookId: string }> };

const parseBookId = (raw: string) => (/^\d+$/.test(raw) && Number(raw) <= 2147483647 ? Number(raw) : NaN);

/** Saves the signed-in reader's rating of a book (1 to 5 stars), replacing any earlier one. */
export const PUT = async (req: NextRequest, { params }: Params) => {
    const startTime = Date.now();
    const { bookId: rawId } = await params;
    // Stryker disable next-line all: logging only
    console.log(`[API] PUT /api/ratings/${rawId} - Request started`);

    const user = await getLoggedInUser();
    if (!user) {
        return Response.json({ error: "Authentication required", message: "User not logged in" }, { status: 401 });
    }

    const bookId = parseBookId(rawId);
    if (isNaN(bookId)) {
        return Response.json({ error: "Validation failed", message: "Invalid book id" }, { status: 400 });
    }

    const body = await req.json().catch(() => undefined);
    const rating = (body as { rating?: unknown } | undefined)?.rating;
    if (!isValidRating(rating)) {
        return Response.json({ error: "Validation failed", message: "Rating must be a whole number from 1 to 5" }, { status: 400 });
    }

    try {
        const result = await saveRating(user.id, bookId, rating);
        if (result === "book-not-found") {
            return Response.json({ error: "Not found", message: "Book not found" }, { status: 404 });
        }
        if (result === "not-returned") {
            return Response.json({ error: "Forbidden", message: "You can only rate books you have returned" }, { status: 403 });
        }

        // The catalogue shows each book's average, which is cached with the book list.
        await invalidateBooksCache();

        // Stryker disable next-line all: logging only
        console.log(`[API] PUT /api/ratings/${bookId} - Saved for ${user.name} in ${Date.now() - startTime}ms`);
        return Response.json({ message: "Rating saved", bookId, rating });
    } catch (error) {
        // Stryker disable next-line all: logging only
        console.error(`[API] PUT /api/ratings/${bookId} - Error after ${Date.now() - startTime}ms:`, error);
        return Response.json({ error: "Internal Server Error", message: "Failed to save rating" }, { status: 500 });
    }
};

/** Removes the signed-in reader's rating of a book. Succeeds when there was no rating. */
export const DELETE = async (_req: NextRequest, { params }: Params) => {
    const startTime = Date.now();
    const { bookId: rawId } = await params;
    // Stryker disable next-line all: logging only
    console.log(`[API] DELETE /api/ratings/${rawId} - Request started`);

    const user = await getLoggedInUser();
    if (!user) {
        return Response.json({ error: "Authentication required", message: "User not logged in" }, { status: 401 });
    }

    const bookId = parseBookId(rawId);
    if (isNaN(bookId)) {
        return Response.json({ error: "Validation failed", message: "Invalid book id" }, { status: 400 });
    }

    try {
        await deleteRating(user.id, bookId);
        await invalidateBooksCache();

        // Stryker disable next-line all: logging only
        console.log(`[API] DELETE /api/ratings/${bookId} - Removed for ${user.name} in ${Date.now() - startTime}ms`);
        return Response.json({ message: "Rating removed", bookId });
    } catch (error) {
        // Stryker disable next-line all: logging only
        console.error(`[API] DELETE /api/ratings/${bookId} - Error after ${Date.now() - startTime}ms:`, error);
        return Response.json({ error: "Internal Server Error", message: "Failed to remove rating" }, { status: 500 });
    }
};
