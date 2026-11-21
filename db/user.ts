import { cache } from "react";
import { getSession } from "@/app/lib/session";
import { User } from "../types/User";
import "@/app/lib/neon-local";
import { neon } from "@neondatabase/serverless";

// Cached per server render: a layout and its page may both ask for the user.
export const getLoggedInUser = cache(async (): Promise<User | null> => {
    const session = await getSession();
    if (!session || !session.user) {
        return null;
    }
    const sql = neon(`${process.env.DATABASE_URL}`);
    const user = await sql`
        SELECT id, name, email, is_admin as "isAdmin", batch_id as "batchId"
        FROM library_users
        WHERE email = ${session.user.email} LIMIT 1;
    `;
    if (user.length === 0) {
        return null;
    }
    return {
        id: user[0].id,
        name: user[0].name,
        email: user[0].email,
        isAdmin: user[0].isAdmin,
        batchId: user[0].batchId,
    };
});

export const checkUserExists = async (email: string): Promise<boolean> => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    const user = await sql`
        SELECT id FROM library_users WHERE email = ${email} LIMIT 1;
    `;
    return user.length > 0;
}

export const checkIsUserAdmin = async (email: string): Promise<boolean> => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    const user = await sql`
        SELECT is_admin FROM library_users WHERE email = ${email} AND is_admin = true LIMIT 1;
    `;
    return user.length > 0;
}

export const getAllLibraryUsers = async (): Promise<User[]> => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    const users = await sql`
        SELECT id, name, email, is_admin as "isAdmin", batch_id as "batchId"
        FROM library_users
        ORDER BY created_at DESC;
    `;
    return users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        isAdmin: u.isAdmin,
        batchId: u.batchId,
    }));
}

export const addLibraryUser = async (name: string, email: string, isAdmin: boolean, batchId: number): Promise<User> => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    const result = await sql`
        INSERT INTO library_users (name, email, is_admin, batch_id)
        VALUES (${name}, ${email}, ${isAdmin}, ${batchId})
        RETURNING id, name, email, is_admin as "isAdmin", batch_id as "batchId";
    `;
    return result[0] as User;
}

export const bulkAddLibraryUsers = async (users: { name: string; email: string; isAdmin: boolean; batchId: number }[]): Promise<{ added: number; skipped: number; users: User[] }> => {
    if (users.length === 0) return { added: 0, skipped: 0, users: [] };
    const sql = neon(`${process.env.DATABASE_URL}`);
    // One statement for the whole upload (up to 1000 rows), inserted in upload order. Someone who
    // already exists, or who appears again later in the same upload, is skipped and left unchanged.
    const rows = await sql`
        INSERT INTO library_users (name, email, is_admin, batch_id)
        SELECT name, email, is_admin, batch_id
        FROM unnest(
            ${users.map(u => u.name)}::text[],
            ${users.map(u => u.email)}::text[],
            ${users.map(u => u.isAdmin)}::boolean[],
            ${users.map(u => u.batchId)}::int[]
        ) WITH ORDINALITY AS u(name, email, is_admin, batch_id, ord)
        ORDER BY ord
        ON CONFLICT (email) DO NOTHING
        RETURNING id, name, email, is_admin as "isAdmin", batch_id as "batchId";
    `;
    // Ids follow insertion order, so sorting by id gives upload order.
    const inserted = (rows as User[]).sort((a, b) => a.id - b.id);
    return { added: inserted.length, skipped: users.length - inserted.length, users: inserted };
}

export const updateUserRole = async (userId: number, isAdmin: boolean): Promise<void> => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    await sql`
        UPDATE library_users SET is_admin = ${isAdmin} WHERE id = ${userId};
    `;
}

export const deleteLibraryUser = async (userId: number): Promise<void> => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    // One statement, so it is atomic: if the library user cannot be deleted (FK violation from
    // borrow history) nothing is removed. Deleting the matching NextAuth user cascades to its
    // accounts and sessions, which signs the deleted user out immediately.
    await sql`
        WITH deleted AS (
            DELETE FROM library_users WHERE id = ${userId} RETURNING email
        )
        DELETE FROM users WHERE email IN (SELECT email FROM deleted);
    `;
}