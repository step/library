import { NextRequest } from 'next/server';
import { borrowBook } from "../../../../../db/borrowedBooks";
import { getLoggedInUser } from "../../../../../db/user";
import { invalidateBooksCache } from "../../../action";

export async function POST(request: NextRequest) {
    const startTime = Date.now();
    // Stryker disable next-line all: logging only
    console.log(`[API] POST /api/books/borrow - Request started`);
    
    try {
        const { barcode } = await request.json();

        // Validate required fields
        if (!barcode) {
            // Stryker disable next-line all: logging only
            console.log(`[API] POST /api/books/borrow - Missing barcode`);
            return Response.json(
                { error: "Validation failed", message: "Barcode is required" },
                { status: 400 }
            );
        }
        
        if (typeof barcode !== 'string' || barcode.trim().length === 0) {
            // Stryker disable next-line all: logging only
            console.log(`[API] POST /api/books/borrow - Invalid barcode format`);
            return Response.json(
                { error: "Validation failed", message: "Barcode must be a non-empty string" },
                { status: 400 }
            );
        }
        
        // Check user authentication
        const user = await getLoggedInUser();
        if (!user) {
            // Stryker disable next-line all: logging only
            console.log(`[API] POST /api/books/borrow - User not authenticated`);
            return Response.json(
                { error: "Authentication required", message: "User not logged in" },
                { status: 401 }
            );
        }
        
        // Stryker disable next-line all: logging only
        console.log(`[API] POST /api/books/borrow - User: ${user.name}, Barcode: ${barcode}`);
        
        // Attempt to borrow the book
        const result = await borrowBook(user.id, barcode.trim());
        
        if (!result.success) {
            // Stryker disable next-line all: logging only
            const duration = Date.now() - startTime;
            // Stryker disable next-line all: logging only
            console.log(`[API] POST /api/books/borrow - Failed to borrow: ${result.message} (${duration}ms)`);
            return Response.json(
                { error: "Borrow failed", message: result.message },
                { status: 400 }
            );
        }
        
        // Invalidate cache after successful borrow operation
        await invalidateBooksCache();
        
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.log(`[API] POST /api/books/borrow - Success: Book borrowed for ${user.name} in ${duration}ms`);
        
        return Response.json(
            { message: "Book borrowed successfully", barcode: barcode.trim() },
            { status: 200 }
        );
        
    } catch (error) {
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.error(`[API] POST /api/books/borrow - Error after ${duration}ms:`, error);
        
        return Response.json(
            { error: "Internal Server Error", message: "Failed to borrow book" },
            { status: 500 }
        );
    }
}
