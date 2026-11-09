import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    q, insertBook, insertUser, openLoan, pgCode, insertNextAuthUser,
} from "../../test/integration/fixtures";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));
vi.mock("@/app/lib/auth", () => ({ authOptions: {} }));

import {
    getLoggedInUser, checkUserExists, checkIsUserAdmin, getAllLibraryUsers, addLibraryUser,
    bulkAddLibraryUsers, updateUserRole, deleteLibraryUser,
} from "../user";

beforeEach(() => {
    session.current = null;
});

const signedInAs = (email: string | null | undefined) => {
    session.current = { user: { email, name: "x" } };
};

describe("getLoggedInUser", () => {
    it("is null with no session, or a session without a user", async () => {
        session.current = null;
        expect(await getLoggedInUser()).toBeNull();
        session.current = {};
        expect(await getLoggedInUser()).toBeNull();
    });

    it("is null when the Google account is not a library user", async () => {
        await insertUser({ email: "mia@x.com" });
        signedInAs("stranger@x.com");
        expect(await getLoggedInUser()).toBeNull();
    });

    it("is null for a session with no email (never matches a row with a null/blank email)", async () => {
        await insertUser({ email: "mia@x.com" });
        signedInAs(undefined);
        expect(await getLoggedInUser()).toBeNull();
        signedInAs("");
        expect(await getLoggedInUser()).toBeNull();
    });

    it("returns the library user, with the numeric id the session itself lacks", async () => {
        const mia = await insertUser({ name: "Mia", email: "mia@x.com", isAdmin: true, batchId: 7 });
        await insertUser({ email: "other@x.com" });
        signedInAs("mia@x.com");
        expect(await getLoggedInUser()).toEqual({ id: mia.id, name: "Mia", email: "mia@x.com", isAdmin: true, batchId: 7 });
    });

    it("matches emails exactly (case-sensitive): stored addresses are lowercased on the way in", async () => {
        await insertUser({ email: "mia@x.com" });
        signedInAs("Mia@x.com");
        expect(await getLoggedInUser()).toBeNull();
    });

    it("a quote or percent in the email is not treated as SQL or a wildcard", async () => {
        await insertUser({ email: "mia@x.com" });
        signedInAs("' OR '1'='1");
        expect(await getLoggedInUser()).toBeNull();
        signedInAs("%");
        expect(await getLoggedInUser()).toBeNull();
    });
});

describe("checkUserExists / checkIsUserAdmin", () => {
    it("knows who exists", async () => {
        await insertUser({ email: "mia@x.com" });
        expect(await checkUserExists("mia@x.com")).toBe(true);
        expect(await checkUserExists("nobody@x.com")).toBe(false);
        expect(await checkUserExists("%")).toBe(false);
        expect(await checkUserExists("")).toBe(false);
    });

    it("knows who is an admin", async () => {
        await insertUser({ email: "boss@x.com", isAdmin: true });
        await insertUser({ email: "mia@x.com", isAdmin: false });
        expect(await checkIsUserAdmin("boss@x.com")).toBe(true);
        expect(await checkIsUserAdmin("mia@x.com")).toBe(false);
        expect(await checkIsUserAdmin("nobody@x.com")).toBe(false);
    });

    it("a NULL is_admin counts as not admin", async () => {
        await q(`INSERT INTO library_users (name, email, is_admin, batch_id) VALUES ('n','n@x.com', NULL, 1)`);
        expect(await checkIsUserAdmin("n@x.com")).toBe(false);
    });
});

describe("getAllLibraryUsers", () => {
    it("is empty for a new library", async () => {
        expect(await getAllLibraryUsers()).toEqual([]);
    });

    it("lists newest first with every field", async () => {
        const a = await insertUser({ name: "A", email: "a@x.com" });
        await q(`UPDATE library_users SET created_at = now() - interval '1 day' WHERE id = $1`, [a.id]);
        const b = await insertUser({ name: "B", email: "b@x.com", isAdmin: true, batchId: 9 });
        expect(await getAllLibraryUsers()).toEqual([
            { id: b.id, name: "B", email: "b@x.com", isAdmin: true, batchId: 9 },
            { id: a.id, name: "A", email: "a@x.com", isAdmin: false, batchId: 1 },
        ]);
    });
});

describe("addLibraryUser", () => {
    it("adds and returns the user", async () => {
        const u = await addLibraryUser("Ada", "ada@x.com", true, 12);
        expect(u).toEqual({ id: expect.any(Number), name: "Ada", email: "ada@x.com", isAdmin: true, batchId: 12 });
        expect(await checkUserExists("ada@x.com")).toBe(true);
    });

    it("rejects a duplicate email with a unique-violation error (code 23505)", async () => {
        await addLibraryUser("Ada", "ada@x.com", false, 1);
        await expect(addLibraryUser("Ada 2", "ada@x.com", false, 1)).rejects.toMatchObject({ code: "23505" });
        expect(await q(`SELECT 1 FROM library_users`)).toHaveLength(1);
    });

    it("stores awkward names exactly", async () => {
        const name = `Zoë O'Brien "ZB"; DROP TABLE library_users; --`;
        await addLibraryUser(name, "z@x.com", false, 1);
        expect((await q(`SELECT name FROM library_users`))[0].name).toBe(name);
    });

    it("rejects a name longer than 255 characters", async () => {
        expect(await pgCode(addLibraryUser("x".repeat(256), "long@x.com", false, 1))).toBe("22001");
    });
});

describe("bulkAddLibraryUsers", () => {
    const row = (n: number, extra = {}) => ({ name: `U${n}`, email: `u${n}@x.com`, isAdmin: false, batchId: 1, ...extra });

    it("does nothing for an empty list", async () => {
        expect(await bulkAddLibraryUsers([])).toEqual({ added: 0, skipped: 0, users: [] });
    });

    it("adds new people and returns them", async () => {
        const r = await bulkAddLibraryUsers([row(1), row(2, { isAdmin: true, batchId: 5 })]);
        expect(r.added).toBe(2);
        expect(r.skipped).toBe(0);
        expect(r.users.map(u => u.email)).toEqual(["u1@x.com", "u2@x.com"]);
        expect(r.users[1]).toMatchObject({ isAdmin: true, batchId: 5 });
    });

    it("skips people who already exist, without changing them", async () => {
        await insertUser({ name: "Original", email: "u1@x.com", isAdmin: true, batchId: 3 });
        const r = await bulkAddLibraryUsers([row(1), row(2)]);
        expect(r).toMatchObject({ added: 1, skipped: 1 });
        expect(r.users.map(u => u.email)).toEqual(["u2@x.com"]);
        expect((await q(`SELECT name, is_admin, batch_id FROM library_users WHERE email='u1@x.com'`))[0]).toEqual({ name: "Original", is_admin: true, batch_id: 3 });
    });

    it("treats a repeat inside the same upload as already existing", async () => {
        const r = await bulkAddLibraryUsers([row(1), row(1, { name: "Again" })]);
        expect(r).toMatchObject({ added: 1, skipped: 1 });
        expect((await q(`SELECT name FROM library_users`))[0].name).toBe("U1");
    });

    it("handles a few hundred rows", async () => {
        const rows = Array.from({ length: 300 }, (_, i) => row(i));
        const r = await bulkAddLibraryUsers(rows);
        expect(r.added).toBe(300);
        expect(await q(`SELECT 1 FROM library_users`)).toHaveLength(300);
    });
});

describe("updateUserRole", () => {
    it("promotes and demotes", async () => {
        const u = await insertUser();
        await updateUserRole(u.id, true);
        expect(await checkIsUserAdmin(u.email)).toBe(true);
        await updateUserRole(u.id, false);
        expect(await checkIsUserAdmin(u.email)).toBe(false);
    });
    it("only changes the one user", async () => {
        const [a, b] = [await insertUser(), await insertUser()];
        await updateUserRole(a.id, true);
        expect(await checkIsUserAdmin(b.email)).toBe(false);
    });
    it("is a harmless no-op for an unknown id", async () => {
        await expect(updateUserRole(9999, true)).resolves.toBeUndefined();
    });
});

describe("deleteLibraryUser", () => {
    it("removes a user with no history, along with their NextAuth user, accounts and sessions", async () => {
        const u = await insertUser({ email: "gone@x.com" });
        await insertNextAuthUser("gone@x.com");
        await deleteLibraryUser(u.id);
        expect(await q(`SELECT 1 FROM library_users`)).toHaveLength(0);
        expect(await q(`SELECT 1 FROM users`)).toHaveLength(0);
        expect(await q(`SELECT 1 FROM accounts`)).toHaveLength(0);
        expect(await q(`SELECT 1 FROM sessions`)).toHaveLength(0);
    });

    it("leaves other people's NextAuth rows alone", async () => {
        const gone = await insertUser({ email: "gone@x.com" });
        await insertUser({ email: "stay@x.com" });
        await insertNextAuthUser("gone@x.com");
        await insertNextAuthUser("stay@x.com");
        await deleteLibraryUser(gone.id);
        expect((await q(`SELECT email FROM users`)).map(r => r.email)).toEqual(["stay@x.com"]);
        expect(await q(`SELECT 1 FROM sessions`)).toHaveLength(1);
    });

    it("works when the user never signed in (no NextAuth row)", async () => {
        const u = await insertUser();
        await expect(deleteLibraryUser(u.id)).resolves.toBeUndefined();
        expect(await q(`SELECT 1 FROM library_users`)).toHaveLength(0);
    });

    it("refuses a user who has borrow history, and removes nothing at all (one atomic statement)", async () => {
        const u = await insertUser({ email: "reader@x.com" });
        await insertNextAuthUser("reader@x.com");
        const b = await insertBook();
        await openLoan(b.copyIds[0], u.id);
        await expect(deleteLibraryUser(u.id)).rejects.toMatchObject({ code: "23001" });
        expect(await q(`SELECT 1 FROM library_users`)).toHaveLength(1);
        expect(await q(`SELECT 1 FROM users`)).toHaveLength(1);
        expect(await q(`SELECT 1 FROM sessions`)).toHaveLength(1);
    });

    it("also refuses a user whose loans are all returned (history still counts)", async () => {
        const u = await insertUser();
        const b = await insertBook();
        const loan = await openLoan(b.copyIds[0], u.id);
        await q(`UPDATE borrowed_books SET returned_at = now() WHERE id=$1`, [loan]);
        await expect(deleteLibraryUser(u.id)).rejects.toMatchObject({ code: "23001" });
    });

    it("is a no-op for an unknown id", async () => {
        await insertUser();
        await deleteLibraryUser(9999);
        expect(await q(`SELECT 1 FROM library_users`)).toHaveLength(1);
    });
});
