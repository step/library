import pg from "pg";
import { TEST_DB_URL } from "./config";

const pool = new pg.Pool({ connectionString: TEST_DB_URL, max: 2 });

export const q = async <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) =>
    (await pool.query<T>(text, params)).rows;

export const closeFixtures = () => pool.end();

export const truncateAll = () =>
    pool.query(`TRUNCATE books, book_copies, borrowed_books, library_users, users, accounts, sessions,
                verification_token, books_db RESTART IDENTITY CASCADE`);

let seq = 0;

export const insertUser = async (o: { name?: string; email?: string; isAdmin?: boolean; batchId?: number } = {}) => {
    seq++;
    const [row] = await q<{ id: number; email: string }>(
        `INSERT INTO library_users (name, email, is_admin, batch_id) VALUES ($1,$2,$3,$4) RETURNING id, email`,
        [o.name ?? `User ${seq}`, o.email ?? `user${seq}@example.com`, o.isAdmin ?? false, o.batchId ?? 1],
    );
    return row;
};

/** Inserts a book and N copies (QR codes qr-<bookId>-1 ...). Counts come from the trigger. */
export const insertBook = async (o: { title?: string; isbn10?: string | null; isbn13?: string | null; copies?: number | string[] } = {}) => {
    seq++;
    const isbn10 = o.isbn10 === undefined ? String(1000000000 + seq) : o.isbn10;
    const isbn13 = o.isbn13 ?? null;
    const [book] = await q<{ id: number }>(
        `INSERT INTO books (title, authors, isbn10, isbn13) VALUES ($1,$2,$3,$4) RETURNING id`,
        [o.title ?? `Book ${seq}`, "Some Author", isbn10, isbn13],
    );
    const qrs = Array.isArray(o.copies) ? o.copies : Array.from({ length: o.copies ?? 1 }, (_, i) => `qr-${book.id}-${i + 1}`);
    const copyIds: number[] = [];
    for (const qr of qrs) {
        const [c] = await q<{ id: number }>(`INSERT INTO book_copies (book_id, qr_code) VALUES ($1,$2) RETURNING id`, [book.id, qr]);
        copyIds.push(c.id);
    }
    return { id: book.id, copyIds, qrs };
};

export const bookCounts = async (bookId: number) => {
    const [r] = await q<{ count: number; borrowed_count: number }>(`SELECT count, borrowed_count FROM books WHERE id = $1`, [bookId]);
    return { count: r.count, borrowed: r.borrowed_count };
};

export const copyBorrowed = async (qr: string) =>
    (await q<{ borrowed: boolean }>(`SELECT borrowed FROM book_copies WHERE qr_code = $1`, [qr]))[0]?.borrowed;

export const loansFor = (copyId: number) =>
    q<{ id: number; user_id: number; returned_at: Date | null }>(`SELECT id, user_id, returned_at FROM borrowed_books WHERE book_copy_id = $1 ORDER BY id`, [copyId]);

/** Opens a loan directly (bypassing app code) for set-up. */
export const openLoan = async (copyId: number, userId: number) =>
    (await q<{ id: number }>(`INSERT INTO borrowed_books (book_copy_id, user_id) VALUES ($1,$2) RETURNING id`, [copyId, userId]))[0].id;

/** Postgres error code of a rejected promise, e.g. 23505 unique, 23503 FK, 23514 check. */
export const pgCode = async (p: Promise<unknown>) => {
    try {
        await p;
    } catch (e) {
        return (e as { code?: string }).code;
    }
    return "no error";
};

export const insertNextAuthUser = async (email: string) => {
    const [u] = await q<{ id: number }>(`INSERT INTO users (name, email) VALUES ('NA', $1) RETURNING id`, [email]);
    await q(`INSERT INTO accounts ("userId", type, provider, "providerAccountId") VALUES ($1,'oauth','google',$2)`, [u.id, `g-${email}`]);
    await q(`INSERT INTO sessions ("userId", expires, "sessionToken") VALUES ($1, now() + interval '1 day', $2)`, [u.id, `tok-${email}`]);
    return u.id;
};

/**
 * Records the first word of every SQL statement a pool client runs (BEGIN, SELECT, COMMIT...).
 * Call before the code under test; the returned array fills as it runs.
 */
export const recordTransactions = (pool: { connect: (...a: never[]) => Promise<unknown> }, spy: (obj: never, method: never) => { mockImplementation: (f: () => Promise<unknown>) => void }) => {
    const log: string[] = [];
    const real = pool.connect.bind(pool);
    spy(pool as never, "connect" as never).mockImplementation(async () => {
        const client = (await real()) as { query: (...a: unknown[]) => unknown };
        const original = Object.getPrototypeOf(client).query.bind(client);
        client.query = (text: unknown, ...rest: unknown[]) => {
            log.push(String(typeof text === "string" ? text : (text as { text: string }).text).trim().split(/\s+/)[0].toUpperCase());
            return original(text, ...rest);
        };
        return client;
    });
    return log;
};

/** Connections of the test database that are sitting inside an unfinished transaction. */
export const openTransactions = async () =>
    Number((await q<{ n: string }>(`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'`))[0].n);

/** A number too big for a Postgres integer: makes any query that uses it fail. */
export const HUGE_ID = 2 ** 40;
