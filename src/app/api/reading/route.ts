import { getLoggedInUser } from "../../../../db/user";
import { getBorrowedBooks } from "../../../../db/borrowedBooks";

export async function GET() {
    const startTime = Date.now();
    // Stryker disable next-line all: logging only
    console.log(`[API] GET /api/reading - Request started`);
    // The NextAuth session has no numeric id, so resolve the library user from the session email.
    const user = await getLoggedInUser();

    if (!user) {
        return Response.json(
            { error: 'Unauthorized - Please log in to access this resource' },
            { status: 401 }
        );
    }


    try {
        // Get user information from middleware headers (more efficient)
        const borrowedBooks = await getBorrowedBooks(user.id);

        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.log(`[API] GET /api/reading - Success: ${borrowedBooks.length} borrowed books returned for ${user.name} in ${duration}ms`);

        return Response.json(borrowedBooks, {
            headers: {
                "Cache-Control": "private, no-cache", // Private data, don't cache
            },
        });

    } catch (error) {
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.error(`[API] GET /api/reading - Error after ${duration}ms:`, error);

        return Response.json(
            { error: "Internal Server Error", message: "Failed to fetch borrowed books" },
            { status: 500 }
        );
    }
}
