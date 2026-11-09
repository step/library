import { NextRequest } from 'next/server';
import "@/app/lib/neon-local";
import { neon, NeonQueryFunction } from "@neondatabase/serverless";
import { Book } from "../../../../types/Book";
import { findBook } from "./books-archeive";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";

type SQL = NeonQueryFunction<false, false>;

const findBookByIsbn = async (sql: SQL, isbn: string): Promise<Book> => {
    const rows = await sql`SELECT * FROM books_db WHERE isbn10 = ${isbn} OR isbn13 = ${isbn} LIMIT 1`;
    if (rows.length === 0) {
        const book = await findBook(isbn);
        if (!book) {
            console.log("No book found with the provided ISBN.", isbn);
            throw new Error("Book not found");
        }
        return {
            id: -1,
            title: book.title,
            authors: book.authors,
            isbn10: book.isbn10,
            isbn13: book.isbn13,
            borrowedCount: 0,
            count: 0,
        }
    }

    return {
        id: rows[0].id,
        title: rows[0].title,
        authors: rows[0].authors,
        isbn10: rows[0].isbn10,
        isbn13: rows[0].isbn13,
        borrowedCount: 0,
        count: 0,
    }
}

export async function GET(request: NextRequest) {
    const startTime = Date.now();
    console.log(`[API] GET /api/book - Request started`);
    
    const session = await getServerSession(authOptions);
    if (!session?.user) {
        return Response.json(
            { error: 'Unauthorized - Please log in to access this resource' },
            { status: 401 }
        );
    }

    try {
        // Use Next.js 15 searchParams API
        const searchParams = request.nextUrl.searchParams;
        const barcode = searchParams.get("barcode");
        
        // Validate required parameters
        if (!barcode) {
            console.log(`[API] GET /api/book - Missing barcode parameter`);
            return Response.json(
                { error: "Validation failed", message: "Barcode query parameter is required" },
                { status: 400 }
            );
        }
        
        if (typeof barcode !== 'string' || barcode.trim().length === 0) {
            console.log(`[API] GET /api/book - Invalid barcode format`);
            return Response.json(
                { error: "Validation failed", message: "Barcode must be a non-empty string" },
                { status: 400 }
            );
        }
        
        console.log(`[API] GET /api/book - Searching for barcode: ${barcode}`);
        
        const sql = neon(`${process.env.DATABASE_URL}`);
        const book = await findBookByIsbn(sql, barcode.trim());
        
        const duration = Date.now() - startTime;
        console.log(`[API] GET /api/book - Success: Book found for barcode ${barcode} in ${duration}ms`);
        
        return Response.json(book, {
            headers: {
                "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800", // Cache for 1 hour
            },
        });
        
    } catch (error) {
        const duration = Date.now() - startTime;
        
        if (error instanceof Error && error.message === "Book not found") {
            console.log(`[API] GET /api/book - Book not found after ${duration}ms`);
            return Response.json(
                { error: "Not found", message: "Book not found" },
                { status: 404 }
            );
        }
        
        console.error(`[API] GET /api/book - Error after ${duration}ms:`, error);
        return Response.json(
            { error: "Internal Server Error", message: "Failed to fetch book" },
            { status: 500 }
        );
    }
}
