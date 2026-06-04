import { NextRequest } from "next/server";
import { getLoggedInUser, updateUserRole, deleteLibraryUser } from "../../../../../db/user";

export const PATCH = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const startTime = Date.now();
    const { id } = await params;
    console.log(`[API] PATCH /api/users/${id} - Request started`);

    const requestingUser = await getLoggedInUser();
    if (!requestingUser || !requestingUser.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = parseInt(id);
    if (isNaN(userId)) {
        return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    if (requestingUser.id === userId) {
        return Response.json({ error: "Cannot modify your own role" }, { status: 400 });
    }

    try {
        const { isAdmin } = await req.json();
        await updateUserRole(userId, !!isAdmin);

        const duration = Date.now() - startTime;
        console.log(`[API] PATCH /api/users/${id} - Updated role in ${duration}ms`);
        return Response.json({ message: "User role updated" });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[API] PATCH /api/users/${id} - Error after ${duration}ms:`, error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const DELETE = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const startTime = Date.now();
    const { id } = await params;
    console.log(`[API] DELETE /api/users/${id} - Request started`);

    const requestingUser = await getLoggedInUser();
    if (!requestingUser || !requestingUser.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = parseInt(id);
    if (isNaN(userId)) {
        return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    if (requestingUser.id === userId) {
        return Response.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    try {
        await deleteLibraryUser(userId);

        const duration = Date.now() - startTime;
        console.log(`[API] DELETE /api/users/${id} - Deleted in ${duration}ms`);
        return Response.json({ message: "User deleted" });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[API] DELETE /api/users/${id} - Error after ${duration}ms:`, error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
