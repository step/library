export type UserInput = { name: string; email: string; isAdmin: boolean; batchId: number };
type Result = { ok: true; value: UserInput } | { ok: false; message: string };

export const MAX_BULK_USERS = 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Accepts 12 or "12" (digits only). Rejects "", null, booleans, decimals, negatives and text. */
export const parseBatchId = (v: unknown): number | null => {
    if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? v : null;
    if (typeof v === "string" && /^\d{1,9}$/.test(v.trim())) return Number(v.trim());
    return null;
};

/** Validates one user as sent to POST /api/users or inside POST /api/users/bulk. Normalises name and email. */
export const validateUser = (u: unknown): Result => {
    if (typeof u !== "object" || u === null || Array.isArray(u)) return { ok: false, message: "Each user must be an object" };
    const { name, email, isAdmin, batchId } = u as Record<string, unknown>;

    if (typeof name !== "string" || !name.trim()) return { ok: false, message: "name is required" };
    if (name.trim().length > 255) return { ok: false, message: "name must be at most 255 characters" };
    if (typeof email !== "string" || !email.trim()) return { ok: false, message: "email is required" };
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail.length > 255 || !EMAIL.test(cleanEmail)) return { ok: false, message: "email is not a valid address" };
    if (isAdmin !== undefined && isAdmin !== null && typeof isAdmin !== "boolean") {
        return { ok: false, message: "isAdmin must be true or false" };
    }
    const batch = parseBatchId(batchId);
    if (batch === null) return { ok: false, message: "batchId is required and must be a whole number" };

    return { ok: true, value: { name: name.trim(), email: cleanEmail, isAdmin: isAdmin === true, batchId: batch } };
};
