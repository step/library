// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest, params } from "../../../../test/helpers/request";
import { ADMIN } from "../../../../test/helpers/identity";

const db = vi.hoisted(() => ({
    getLoggedInUser: vi.fn(),
    getAllLibraryUsers: vi.fn(),
    addLibraryUser: vi.fn(),
    bulkAddLibraryUsers: vi.fn(),
    updateUserRole: vi.fn(),
    deleteLibraryUser: vi.fn(),
}));
vi.mock("../../../../db/user", () => db);

import { GET as listUsers, POST as addUser } from "../users/route";
import { POST as bulk } from "../users/bulk/route";
import { DELETE as deleteUser, PATCH as patchUser } from "../users/[id]/route";
import { MAX_BULK_USERS } from "../users/validate";

const pgError = (code: string, message = "boom") => Object.assign(new Error(message), { code });
const post = (body: unknown) => makeRequest("/api/users", { method: "POST", body });
const raw = (url: string, method: string, rawBody: string) => makeRequest(url, { method, rawBody });

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.getLoggedInUser.mockResolvedValue(ADMIN);
    db.addLibraryUser.mockResolvedValue({ id: 50, name: "N", email: "n@x.com", isAdmin: false, batchId: 1 });
    db.bulkAddLibraryUsers.mockResolvedValue({ added: 0, skipped: 0, users: [] });
    db.updateUserRole.mockResolvedValue(undefined);
    db.deleteLibraryUser.mockResolvedValue(undefined);
});

describe("GET /api/users", () => {
    it("returns the list", async () => {
        db.getAllLibraryUsers.mockResolvedValue([{ id: 1 }]);
        const res = await listUsers();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual([{ id: 1 }]);
    });
    it("answers 500 without details when the database fails", async () => {
        db.getAllLibraryUsers.mockRejectedValue(new Error("pw=secret"));
        const res = await listUsers();
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain("secret");
    });
});

describe("POST /api/users", () => {
    const valid = { name: "N", email: "n@x.com", batchId: 1 };

    it("creates the user and answers 201 with it", async () => {
        const res = await addUser(post(valid));
        expect(res.status).toBe(201);
        expect((await res.json()).user).toMatchObject({ id: 50 });
    });

    it("lowercases and trims before saving, and passes a real boolean", async () => {
        await addUser(post({ name: "  Ada ", email: "  ADA@X.com ", batchId: "12", isAdmin: true }));
        expect(db.addLibraryUser).toHaveBeenCalledWith("Ada", "ada@x.com", true, 12);
    });

    it.each([
        ["missing name", { ...valid, name: undefined }],
        ["blank name", { ...valid, name: "  " }],
        ["numeric name (used to crash on .trim())", { ...valid, name: 5 }],
        ["missing email", { ...valid, email: undefined }],
        ["numeric email", { ...valid, email: 5 }],
        ["malformed email", { ...valid, email: "nope" }],
        ["missing batch", { ...valid, batchId: undefined }],
        ["null batch (used to become 0)", { ...valid, batchId: null }],
        ["empty-string batch (used to become 0)", { ...valid, batchId: "" }],
        ["decimal batch", { ...valid, batchId: 1.5 }],
        ["isAdmin as the string \"false\" (used to become true)", { ...valid, isAdmin: "false" }],
        ["an array body", [valid]],
        ["a string body", "hello"],
        ["a null body", null],
    ])("rejects %s with 400 and writes nothing", async (_n, body) => {
        const res = await addUser(post(body));
        expect(res.status).toBe(400);
        expect(db.addLibraryUser).not.toHaveBeenCalled();
    });

    it("rejects malformed JSON with 400, not 500", async () => {
        const res = await addUser(raw("/api/users", "POST", "{nope"));
        expect(res.status).toBe(400);
        expect(db.addLibraryUser).not.toHaveBeenCalled();
    });

    it("answers 409 for a unique violation whatever language the database speaks", async () => {
        db.addLibraryUser.mockRejectedValue(pgError("23505", "doppelter Schlüsselwert verletzt Unique-Constraint"));
        expect((await addUser(post(valid))).status).toBe(409);
    });
    it("does not treat an unrelated error that mentions 'unique' as a duplicate", async () => {
        db.addLibraryUser.mockRejectedValue(new Error("something unique broke"));
        expect((await addUser(post(valid))).status).toBe(500);
    });
    it("answers 500 for other database errors", async () => {
        db.addLibraryUser.mockRejectedValue(pgError("08006"));
        expect((await addUser(post(valid))).status).toBe(500);
    });
});

describe("POST /api/users/bulk", () => {
    const row = (i: number, extra = {}) => ({ name: `U${i}`, email: `U${i}@X.com`, batchId: 1, ...extra });
    const send = (users: unknown) => bulk(makeRequest("/api/users/bulk", { method: "POST", body: { users } }));

    it("normalises every row and reports the counts", async () => {
        db.bulkAddLibraryUsers.mockResolvedValue({ added: 2, skipped: 1, users: [] });
        const res = await send([row(1), row(2, { isAdmin: true, batchId: "5" }), row(3)]);
        expect(res.status).toBe(200);
        expect(db.bulkAddLibraryUsers).toHaveBeenCalledWith([
            { name: "U1", email: "u1@x.com", isAdmin: false, batchId: 1 },
            { name: "U2", email: "u2@x.com", isAdmin: true, batchId: 5 },
            { name: "U3", email: "u3@x.com", isAdmin: false, batchId: 1 },
        ]);
        expect((await res.json()).message).toBe("2 user(s) added, 1 skipped (already exist)");
    });

    it.each([
        ["no users key", {}],
        ["users not an array", { users: "x" }],
        ["empty list", { users: [] }],
        ["null body", null],
    ])("rejects %s with 400", async (_n, body) => {
        const res = await bulk(makeRequest("/api/users/bulk", { method: "POST", body }));
        expect(res.status).toBe(400);
        expect(db.bulkAddLibraryUsers).not.toHaveBeenCalled();
    });

    it("rejects malformed JSON with 400", async () => {
        expect((await bulk(raw("/api/users/bulk", "POST", "[[["))).status).toBe(400);
    });

    it("one bad row rejects the whole upload, and names the row", async () => {
        const res = await send([row(1), row(2), { ...row(3), email: "bad" }, row(4)]);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(/Row 3/);
        expect(db.bulkAddLibraryUsers).not.toHaveBeenCalled();
    });

    it.each([
        ["numeric name (used to crash with 500)", { name: 1, email: "a@x.com", batchId: 1 }],
        ["numeric email", { name: "A", email: 2, batchId: 1 }],
        ["empty-string batch", { name: "A", email: "a@x.com", batchId: "" }],
        ["a non-object row", "just a string"],
    ])("rejects %s with 400", async (_n, bad) => {
        expect((await send([bad])).status).toBe(400);
    });

    it(`accepts ${MAX_BULK_USERS} rows and rejects one more`, async () => {
        const many = (n: number) => Array.from({ length: n }, (_, i) => row(i));
        expect((await send(many(MAX_BULK_USERS))).status).toBe(200);
        db.bulkAddLibraryUsers.mockClear();
        expect((await send(many(MAX_BULK_USERS + 1))).status).toBe(400);
        expect(db.bulkAddLibraryUsers).not.toHaveBeenCalled();
    });

    it("answers 500 without details when the database fails", async () => {
        db.bulkAddLibraryUsers.mockRejectedValue(new Error("10.0.0.9 down"));
        const res = await send([row(1)]);
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain("10.0.0.9");
    });
});

describe("PATCH /api/users/[id]", () => {
    const patch = (id: string, body: unknown) => patchUser(makeRequest(`/api/users/${id}`, { method: "PATCH", body }), params(id));

    it.each([true, false])("sets isAdmin to %s", async (flag) => {
        expect((await patch("7", { isAdmin: flag })).status).toBe(200);
        expect(db.updateUserRole).toHaveBeenCalledWith(7, flag);
    });

    it.each([
        ["no body flag (used to demote)", {}],
        ["null flag", { isAdmin: null }],
        ["string flag", { isAdmin: "true" }],
        ["numeric flag", { isAdmin: 1 }],
        ["null body", null],
    ])("rejects %s with 400 and changes nobody", async (_n, body) => {
        expect((await patch("7", body)).status).toBe(400);
        expect(db.updateUserRole).not.toHaveBeenCalled();
    });

    it("rejects malformed JSON with 400", async () => {
        const res = await patchUser(raw("/api/users/7", "PATCH", "{x"), params("7"));
        expect(res.status).toBe(400);
    });

    it.each(["abc", "12abc", "1.5", "-3", "", "1e3", " 7"])("rejects the id %j", async (id) => {
        expect((await patch(id, { isAdmin: true })).status).toBe(400);
        expect(db.updateUserRole).not.toHaveBeenCalled();
    });

    it("answers 500 without details when the database fails", async () => {
        db.updateUserRole.mockRejectedValue(new Error("pw=secret"));
        const res = await patch("7", { isAdmin: true });
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain("secret");
    });
});

describe("DELETE /api/users/[id]", () => {
    const del = (id: string) => deleteUser(makeRequest(`/api/users/${id}`, { method: "DELETE" }), params(id));

    it("deletes and answers 200", async () => {
        expect((await del("7")).status).toBe(200);
        expect(db.deleteLibraryUser).toHaveBeenCalledWith(7);
    });

    it.each(["abc", "12abc", "1.5", "-3", ""])("rejects the id %j", async (id) => {
        expect((await del(id)).status).toBe(400);
        expect(db.deleteLibraryUser).not.toHaveBeenCalled();
    });

    it.each([
        ["23001", "ON DELETE RESTRICT (what Postgres raises for this schema)"],
        ["23503", "a plain foreign key violation"],
    ])("answers 409 for %s: %s", async (code) => {
        db.deleteLibraryUser.mockRejectedValue(pgError(code));
        const res = await del("7");
        expect(res.status).toBe(409);
        expect((await res.json()).error).toMatch(/borrowed books/);
    });

    it("answers 500 for any other error and does not leak it", async () => {
        db.deleteLibraryUser.mockRejectedValue(pgError("57P01", "terminating connection 10.1.2.3"));
        const res = await del("7");
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain("10.1.2.3");
    });
});
