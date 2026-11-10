import { NextRequest } from 'next/server';
import { returnBook } from "../../../../../db/borrowedBooks";
import { getLoggedInUser } from "../../../../../db/user";
import { invalidateBooksCache } from "../../../action";

export async function POST(request: NextRequest) {
    const startTime = Date.now();
    // Stryker disable next-line all: logging only
    console.log(`[API] POST /api/reading/return - Request started`);
    
    try {
        const { barcode } = await request.json();
        
        // Validate required fields
        if (!barcode) {
            // Stryker disable next-line all: logging only
            console.log(`[API] POST /api/reading/return - Missing barcode`);
            return Response.json(
                { error: "Validation failed", message: "Barcode is required" },
                { status: 400 }
            );
        }
        
        if (typeof barcode !== 'string' || barcode.trim().length === 0) {
            // Stryker disable next-line all: logging only
            console.log(`[API] POST /api/reading/return - Invalid barcode format`);
            return Response.json(
                { error: "Validation failed", message: "Barcode must be a non-empty string" },
                { status: 400 }
            );
        }
        
        // Check user authentication
        const loggedInUser = await getLoggedInUser();
        if (!loggedInUser) {
            // Stryker disable next-line all: logging only
            console.log(`[API] POST /api/reading/return - User not authenticated`);
            return Response.json(
                { error: "Authentication required", message: "User not logged in" },
                { status: 401 }
            );
        }
        
        // Stryker disable next-line all: logging only
        console.log(`[API] POST /api/reading/return - User: ${loggedInUser.name}, Barcode: ${barcode}`);
        
        // Attempt to return the book
        const result = await returnBook(loggedInUser.id, barcode.trim());
        
        if (!result.success) {
            // Stryker disable next-line all: logging only
            const duration = Date.now() - startTime;
            // Stryker disable next-line all: logging only
            console.log(`[API] POST /api/reading/return - Failed to return book (${duration}ms)`);
            return Response.json(
                { error: "Return failed", message: result.message },
                { status: 400 }
            );
        }

        await invalidateBooksCache();
        
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.log(`[API] POST /api/reading/return - Success: Book returned for ${loggedInUser.name} in ${duration}ms`);
        
        return Response.json(
            { message: "Book returned successfully", barcode: barcode.trim() },
            { status: 200 }
        );
        
    } catch (error) {
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.error(`[API] POST /api/reading/return - Error after ${duration}ms:`, error);
        
        return Response.json(
            { error: "Internal Server Error", message: "Failed to return book" },
            { status: 500 }
        );
    }
}
