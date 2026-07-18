import { authOptions } from "@/app/lib/auth"
import { getServerSession } from "next-auth"
import { User } from "../types/User";
import { neon } from "@neondatabase/serverless";

export const getLoggedInUser = async (): Promise<User | null> => {
    const session = await getServerSession(authOptions);
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
}

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
    const sql = neon(`${process.env.DATABASE_URL}`);
    let added = 0;
    let skipped = 0;
    const inserted: User[] = [];
    for (const user of users) {
        const existing = await sql`SELECT id FROM library_users WHERE email = ${user.email} LIMIT 1`;
        if (existing.length > 0) {
            skipped++;
            continue;
        }
        const result = await sql`
            INSERT INTO library_users (name, email, is_admin, batch_id)
            VALUES (${user.name}, ${user.email}, ${user.isAdmin}, ${user.batchId})
            RETURNING id, name, email, is_admin as "isAdmin", batch_id as "batchId";
        `;
        inserted.push(result[0] as User);
        added++;
    }
    return { added, skipped, users: inserted };
}

export const updateUserRole = async (userId: number, isAdmin: boolean): Promise<void> => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    await sql`
        UPDATE library_users SET is_admin = ${isAdmin} WHERE id = ${userId};
    `;
}

export const deleteLibraryUser = async (userId: number): Promise<void> => {
    const sql = neon(`${process.env.DATABASE_URL}`);
    await sql`
        DELETE FROM library_users WHERE id = ${userId};
    `;
}