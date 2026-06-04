import { NextRequest } from "next/server";
import { getLoggedInUser } from "../../../../db/user";
import { getAllLibraryUsers, addLibraryUser } from "../../../../db/user";

export const GET = async () => {
    const startTime = Date.now();
    console.log(`[API] GET /api/users - Request started`);

    const user = await getLoggedInUser();
    if (!user || !user.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const users = await getAllLibraryUsers();
        const duration = Date.now() - startTime;
        console.log(`[API] GET /api/users - Success: ${users.length} users in ${duration}ms`);
        return Response.json(users);
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[API] GET /api/users - Error after ${duration}ms:`, error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const POST = async (req: NextRequest) => {
    const startTime = Date.now();
    console.log(`[API] POST /api/users - Request started`);

    const requestingUser = await getLoggedInUser();
    if (!requestingUser || !requestingUser.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const { name, email, isAdmin } = await req.json();

        if (!name || !email) {
            return Response.json({ error: "name and email are required" }, { status: 400 });
        }

        await addLibraryUser(name.trim(), email.trim().toLowerCase(), !!isAdmin);

        const duration = Date.now() - startTime;
        console.log(`[API] POST /api/users - Added user ${email} in ${duration}ms`);
        return Response.json({ message: "User added successfully" }, { status: 201 });
    } catch (error) {
        const duration = Date.now() - startTime;
        if (error instanceof Error && error.message.includes('unique')) {
            return Response.json({ error: "User with this email already exists" }, { status: 409 });
        }
        console.error(`[API] POST /api/users - Error after ${duration}ms:`, error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
