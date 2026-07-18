import { NextRequest } from "next/server";
import { getLoggedInUser, bulkAddLibraryUsers } from "../../../../../db/user";

export const POST = async (req: NextRequest) => {
    const startTime = Date.now();
    console.log(`[API] POST /api/users/bulk - Request started`);

    const requestingUser = await getLoggedInUser();
    if (!requestingUser || !requestingUser.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const { users } = await req.json();

        if (!Array.isArray(users) || users.length === 0) {
            return Response.json({ error: "users array is required" }, { status: 400 });
        }

        for (const u of users) {
            if (!u.name || !u.email || !Number.isInteger(Number(u.batchId))) {
                return Response.json({ error: "Each user must have name, email and an integer batchId" }, { status: 400 });
            }
        }

        const result = await bulkAddLibraryUsers(
            users.map(u => ({
                name: u.name.trim(),
                email: u.email.trim().toLowerCase(),
                isAdmin: !!u.isAdmin,
                batchId: Number(u.batchId),
            }))
        );

        const duration = Date.now() - startTime;
        console.log(`[API] POST /api/users/bulk - ${result.added} added, ${result.skipped} skipped in ${duration}ms`);
        return Response.json({ message: `${result.added} user(s) added, ${result.skipped} skipped (already exist)`, ...result }, { status: 200 });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[API] POST /api/users/bulk - Error after ${duration}ms:`, error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
