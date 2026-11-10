import { NextRequest } from "next/server";
import { getLoggedInUser, bulkAddLibraryUsers } from "../../../../../db/user";
import { validateUser, MAX_BULK_USERS } from "../validate";

export const POST = async (req: NextRequest) => {
    const startTime = Date.now();
    // Stryker disable next-line all: logging only
    console.log(`[API] POST /api/users/bulk - Request started`);

    const requestingUser = await getLoggedInUser();
    if (!requestingUser || !requestingUser.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => undefined);
        const users = (body as { users?: unknown } | undefined)?.users;
        if (!Array.isArray(users) || users.length === 0) {
            return Response.json({ error: "users array is required" }, { status: 400 });
        }
        if (users.length > MAX_BULK_USERS) {
            return Response.json({ error: `At most ${MAX_BULK_USERS} users can be imported at once` }, { status: 400 });
        }

        // Validate everything first, so a bad row rejects the whole upload instead of half of it.
        const clean = [];
        for (const [i, u] of users.entries()) {
            const parsed = validateUser(u);
            if (!parsed.ok) {
                return Response.json({ error: `Row ${i + 1}: ${parsed.message}` }, { status: 400 });
            }
            clean.push(parsed.value);
        }

        const result = await bulkAddLibraryUsers(clean);

        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.log(`[API] POST /api/users/bulk - ${result.added} added, ${result.skipped} skipped in ${duration}ms`);
        return Response.json({ message: `${result.added} user(s) added, ${result.skipped} skipped (already exist)`, ...result }, { status: 200 });
    } catch (error) {
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.error(`[API] POST /api/users/bulk - Error after ${duration}ms:`, error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
