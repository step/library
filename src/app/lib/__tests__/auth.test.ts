// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ checkUserExists: vi.fn(), checkIsUserAdmin: vi.fn() }));

vi.mock("@auth/neon-adapter", () => ({ default: () => ({}) }));
vi.mock("../db", () => ({ pool: {} }));
vi.mock("../../../../db/user", () => ({
    checkUserExists: m.checkUserExists,
    checkIsUserAdmin: m.checkIsUserAdmin,
}));

import { authOptions } from "../auth";

// The callbacks are always defined in authOptions.
const signIn = authOptions.callbacks!.signIn!;
const session = authOptions.callbacks!.session!;

const signInWith = (email?: string | null) =>
    signIn({ profile: email === undefined ? undefined : { email } } as never);

beforeEach(() => vi.clearAllMocks());

describe("signIn callback (who may sign in)", () => {
    it("denies a Google account without an email and never queries the database", async () => {
        expect(await signInWith(undefined)).toBe(false);
        expect(await signInWith(null)).toBe(false);
        expect(await signInWith("")).toBe(false);
        expect(m.checkUserExists).not.toHaveBeenCalled();
    });

    it("denies an email that is not a library user", async () => {
        m.checkUserExists.mockResolvedValue(false);
        expect(await signInWith("stranger@gmail.com")).toBe(false);
        expect(m.checkUserExists).toHaveBeenCalledWith("stranger@gmail.com");
    });

    it("allows a library user", async () => {
        m.checkUserExists.mockResolvedValue(true);
        expect(await signInWith("mia@example.com")).toBe(true);
    });

    it("passes the email through unchanged (matching rules live in the query)", async () => {
        m.checkUserExists.mockResolvedValue(true);
        await signInWith("Mia@Example.com");
        expect(m.checkUserExists).toHaveBeenCalledWith("Mia@Example.com");
    });

    it("lets a database failure surface as an error, never as an allowed sign-in", async () => {
        m.checkUserExists.mockRejectedValue(new Error("db down"));
        await expect(signInWith("mia@example.com")).rejects.toThrow("db down");
    });
});

describe("session callback (admin flag)", () => {
    const baseSession = () => ({ user: { name: "Mia", email: "mia@example.com" }, expires: "x" });

    it.each([true, false])("copies isAdmin=%s onto the session", async (isAdmin) => {
        m.checkIsUserAdmin.mockResolvedValue(isAdmin);
        const result = await session({ session: baseSession(), user: { email: "mia@example.com" } } as never);
        expect((result as { user: { isAdmin: boolean } }).user.isAdmin).toBe(isAdmin);
        expect(m.checkIsUserAdmin).toHaveBeenCalledWith("mia@example.com");
    });

    it("does not throw or query when the user is missing (regression)", async () => {
        const s = baseSession();
        const result = await session({ session: s, user: undefined } as never);
        expect(result).toBe(s);
        expect(m.checkIsUserAdmin).not.toHaveBeenCalled();
        expect((result as { user: { isAdmin?: boolean } }).user.isAdmin).toBeUndefined();
    });

    it("does not add other fields to the session", async () => {
        m.checkIsUserAdmin.mockResolvedValue(false);
        const result = await session({ session: baseSession(), user: { email: "mia@example.com", id: "9", password: "x" } } as never);
        expect(Object.keys((result as { user: object }).user).sort()).toEqual(["email", "isAdmin", "name"]);
    });
});

describe("configuration", () => {
    it("keeps sessions in the database so deleting a user signs them out", () => {
        expect(authOptions.session?.strategy).toBe("database");
    });
    it("has exactly one provider: Google", () => {
        expect(authOptions.providers).toHaveLength(1);
        expect((authOptions.providers[0] as { id: string }).id).toBe("google");
    });
});
