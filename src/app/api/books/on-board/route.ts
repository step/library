import { NextRequest } from "next/server";
import { onboardBook } from "../../../../../db/books";
import { invalidateBooksCache } from "../../../action";
import { getLoggedInUser } from "../../../../../db/user";
import { validateOnboardBody } from "./validate";

const createForbiddenResponse = (message: string) => {
    return new Response(
        JSON.stringify({ error: `Forbidden ${message}`, message }),
        { status: 403 }
    );
}

export const POST = async (req: NextRequest) => {
    const startTime = Date.now();
    console.log(`[API] POST /api/books/on-board - Request started`);

    try {
        // Require admin user for book onboarding
        const user = await getLoggedInUser();
        if (!user || !user.isAdmin) {
            console.log(`[API] POST /api/books/on-board - Rejected non-admin request`);
            return createForbiddenResponse("Only administrators can onboard books");
        }

        let data: unknown;
        try {
            data = await req.json();
        } catch {
            return Response.json({ error: "Validation failed", message: "Request body must be valid JSON" }, { status: 400 });
        }

        const parsed = validateOnboardBody(data);
        if (!parsed.ok) {
            return Response.json({ error: "Validation failed", message: parsed.message }, { status: 400 });
        }
        const { title } = parsed.value;

        await onboardBook(parsed.value);

        // Invalidate cache after successful book onboarding
        await invalidateBooksCache();

        const duration = Date.now() - startTime;
        console.log(`[API] POST /api/books/on-board - Success: Book "${title}" onboarded by ${user.email} in ${duration}ms`);

        return Response.json(
            { message: "Book onboarded successfully" },
            { status: 200 }
        );

    } catch (error) {
        const duration = Date.now() - startTime;

        // Handle admin access errors specifically
        if (error instanceof Error && error.message.includes('Access denied')) {
            console.log(`[API] POST /api/books/on-board - ${error.message} in ${duration}ms`);
            return createForbiddenResponse("Only administrators can onboard books");
        }

        console.error(`[API] POST /api/books/on-board - Error after ${duration}ms:`, error);

        return Response.json(
            { error: "Internal Server Error", message: "Failed to onboard book" },
            { status: 500 }
        );
    }
}