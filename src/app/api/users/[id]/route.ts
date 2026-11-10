import { NextRequest } from "next/server";
import { getLoggedInUser, updateUserRole, deleteLibraryUser } from "../../../../../db/user";

export const PATCH = async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const startTime = Date.now();
    const { id } = await params;
    // Stryker disable next-line all: logging only
    console.log(`[API] PATCH /api/users/${id} - Request started`);

    const requestingUser = await getLoggedInUser();
    if (!requestingUser || !requestingUser.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = /^\d+$/.test(id) ? Number(id) : NaN;
    if (isNaN(userId)) {
        return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    if (requestingUser.id === userId) {
        return Response.json({ error: "Cannot modify your own role" }, { status: 400 });
    }

    try {
        const body = await req.json().catch(() => undefined);
        const isAdmin = (body as { isAdmin?: unknown } | undefined)?.isAdmin;
        // A missing or non-boolean flag must not silently demote (or promote) anyone.
        if (typeof isAdmin !== "boolean") {
            return Response.json({ error: "isAdmin must be true or false" }, { status: 400 });
        }
        await updateUserRole(userId, isAdmin);

        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.log(`[API] PATCH /api/users/${id} - Updated role in ${duration}ms`);
        return Response.json({ message: "User role updated" });
    } catch (error) {
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.error(`[API] PATCH /api/users/${id} - Error after ${duration}ms:`, error);
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export const DELETE = async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const startTime = Date.now();
    const { id } = await params;
    // Stryker disable next-line all: logging only
    console.log(`[API] DELETE /api/users/${id} - Request started`);

    const requestingUser = await getLoggedInUser();
    if (!requestingUser || !requestingUser.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = /^\d+$/.test(id) ? Number(id) : NaN;
    if (isNaN(userId)) {
        return Response.json({ error: "Invalid user id" }, { status: 400 });
    }

    if (requestingUser.id === userId) {
        return Response.json({ error: "Cannot delete your own account" }, { status: 400 });
    }

    try {
        await deleteLibraryUser(userId);

        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.log(`[API] DELETE /api/users/${id} - Deleted in ${duration}ms`);
        return Response.json({ message: "User deleted" });
    } catch (error) {
        // Stryker disable next-line all: logging only
        const duration = Date.now() - startTime;
        // Stryker disable next-line all: logging only
        console.error(`[API] DELETE /api/users/${id} - Error after ${duration}ms:`, error);
        // 23503 = foreign_key_violation: the user still has borrow history.
        // ON DELETE RESTRICT raises 23001; a plain foreign key violation is 23503.
        const code = (error as { code?: string })?.code;
        if (code === "23001" || code === "23503") {
            return Response.json(
                { error: "User has borrowed books and cannot be deleted" },
                { status: 409 }
            );
        }
        return Response.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
