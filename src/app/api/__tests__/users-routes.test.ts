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

import { POST as addUser } from "../users/route";
import { DELETE as deleteUser, PATCH as patchUser } from "../users/[id]/route";

const pgError = (code: string, message = "boom") => Object.assign(new Error(message), { code });

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.getLoggedInUser.mockResolvedValue(ADMIN);
});

describe("POST /api/users: duplicate emails", () => {
    const call = () => addUser(makeRequest("/api/users", { method: "POST", body: { name: "N", email: "N@X.com", batchId: 1 } }));

    it("answers 409 for a unique violation, whatever language the database speaks", async () => {
        db.addLibraryUser.mockRejectedValue(pgError("23505", "doppelter Schlüsselwert verletzt Unique-Constraint"));
        expect((await call()).status).toBe(409);
    });

    it("does not treat an unrelated error that mentions 'unique' as a duplicate", async () => {
        db.addLibraryUser.mockRejectedValue(new Error("column is not unique-ish but something else broke"));
        expect((await call()).status).toBe(500);
    });

    it("answers 500 for other database errors", async () => {
        db.addLibraryUser.mockRejectedValue(pgError("08006"));
        expect((await call()).status).toBe(500);
    });

    it("lowercases and trims before saving", async () => {
        db.addLibraryUser.mockResolvedValue({ id: 5 });
        await addUser(makeRequest("/api/users", { method: "POST", body: { name: "  Ada ", email: "  ADA@X.com ", batchId: "12", isAdmin: 1 } }));
        expect(db.addLibraryUser).toHaveBeenCalledWith("Ada", "ada@x.com", true, 12);
    });
});

describe("DELETE /api/users/[id]: users with borrow history", () => {
    const call = () => deleteUser(makeRequest("/api/users/7", { method: "DELETE" }), params("7"));

    it.each([
        ["23001", "ON DELETE RESTRICT (what Postgres raises for this schema)"],
        ["23503", "a plain foreign key violation"],
    ])("answers 409 for %s: %s", async (code) => {
        db.deleteLibraryUser.mockRejectedValue(pgError(code));
        const res = await call();
        expect(res.status).toBe(409);
        expect((await res.json()).error).toMatch(/borrowed books/);
    });

    it("answers 500 for any other error and does not leak it", async () => {
        db.deleteLibraryUser.mockRejectedValue(pgError("57P01", "terminating connection 10.1.2.3"));
        const res = await call();
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain("10.1.2.3");
    });

    it("answers 200 on success", async () => {
        db.deleteLibraryUser.mockResolvedValue(undefined);
        expect((await call()).status).toBe(200);
        expect(db.deleteLibraryUser).toHaveBeenCalledWith(7);
    });
});

describe("PATCH /api/users/[id]", () => {
    it("turns the isAdmin flag into a real boolean", async () => {
        db.updateUserRole.mockResolvedValue(undefined);
        await patchUser(makeRequest("/api/users/7", { method: "PATCH", body: { isAdmin: "yes" } }), params("7"));
        expect(db.updateUserRole).toHaveBeenCalledWith(7, true);
        await patchUser(makeRequest("/api/users/7", { method: "PATCH", body: {} }), params("7"));
        expect(db.updateUserRole).toHaveBeenLastCalledWith(7, false);
    });
});
