import { OnboardBookReqBody } from "../../../../../types/OnboardBookReqBody";

export const MAX_COPIES = 500;

type Result = { ok: true; value: OnboardBookReqBody } | { ok: false; message: string };

const cleanIsbn = (v: unknown): string | undefined | null => {
    if (v === undefined || v === null || v === "") return undefined;
    if (typeof v !== "string") return null; // wrong type
    return v.replace(/[\s-]/g, "");
};

/** Validates and normalises the body of POST /api/books/on-board. Mirrors the add-book form rules. */
export const validateOnboardBody = (data: unknown): Result => {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
        return { ok: false, message: "Request body must be a JSON object" };
    }
    const { title, authors, isbn10, isbn13, copies } = data as Record<string, unknown>;

    if (typeof title !== "string" || title.trim().length < 2) return { ok: false, message: "Title is required" };
    if (typeof authors !== "string" || authors.trim().length < 2) return { ok: false, message: "Authors are required" };

    const i10 = cleanIsbn(isbn10);
    const i13 = cleanIsbn(isbn13);
    if (i10 === null) return { ok: false, message: "isbn10 must be a string" };
    if (i13 === null) return { ok: false, message: "isbn13 must be a string" };
    if (!i10 && !i13) return { ok: false, message: "At least one ISBN is required" };
    if (i10 && !/^[0-9]{9}[0-9Xx]$/.test(i10)) return { ok: false, message: "isbn10 must have 10 characters (the last can be X)" };
    if (i13 && !/^[0-9]{13}$/.test(i13)) return { ok: false, message: "isbn13 must have 13 digits" };

    if (!Array.isArray(copies)) return { ok: false, message: "copies must be an array of QR codes" };
    if (copies.length > MAX_COPIES) return { ok: false, message: `At most ${MAX_COPIES} copies can be added at once` };
    if (copies.some(c => typeof c !== "string" || c.trim().length === 0)) {
        return { ok: false, message: "Every copy must be a non-empty string" };
    }

    return {
        ok: true,
        value: {
            title: title.trim(),
            authors: authors.trim(),
            ...(i10 && { isbn10: i10 }),
            ...(i13 && { isbn13: i13 }),
            copies: [...new Set((copies as string[]).map(c => c.trim()))],
        },
    };
};
