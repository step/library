import { NextRequest } from "next/server";
import { getLoggedInUser } from "../../../../db/user";
import { getAllLibraryUsers, addLibraryUser } from "../../../../db/user";
import { validateUser } from "./validate";

export const GET = async () => {
    const startTime = Date.now();
    // Stryker disable next-line all: logging only
    console.log(`[API] GET /api/users - Request started`);

    const user = await getLoggedInUser();
    if (!user || !user.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const users = await getAllLibraryUsers();
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.log(`[API] GET /api/users - Success: ${users.length} users in ${duration}ms`);
        return Response.json(users);
    } catch (error) {
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.error(`[API] GET /api/users - Error after ${duration}ms:`, error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const POST = async (req: NextRequest) => {
    const startTime = Date.now();
    // Stryker disable next-line all: logging only
    console.log(`[API] POST /api/users - Request started`);

    const requestingUser = await getLoggedInUser();
    if (!requestingUser || !requestingUser.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => undefined);
        const parsed = validateUser(body);
        if (!parsed.ok) {
            return Response.json({ error: parsed.message }, { status: 400 });
        }
        const { name, email, isAdmin, batchId } = parsed.value;

        const user = await addLibraryUser(name, email, isAdmin, batchId);
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.log(`[API] POST /api/users - Added user ${email} in ${duration}ms`);
        return Response.json({ message: "User added successfully", user }, { status: 201 });
    } catch (error) {
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // 23505 = unique_violation. (Matching the message text broke on non-English servers.)
        if ((error as { code?: string })?.code === '23505') {
            return Response.json({ error: "User with this email already exists" }, { status: 409 });
        }
        // Stryker disable next-line all: logging only
        console.error(`[API] POST /api/users - Error after ${duration}ms:`, error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
