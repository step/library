import { describe, it, expect } from "vitest";
import { parseBatchId, validateUser, MAX_BULK_USERS } from "../validate";

const good = { name: "Ada Lovelace", email: "ada@example.com", isAdmin: false, batchId: 12 };
const fail = (u: unknown) => {
    const r = validateUser(u);
    expect(r.ok).toBe(false);
    return (r as { message: string }).message;
};
const ok = (u: unknown) => {
    const r = validateUser(u);
    expect(r.ok).toBe(true);
    return (r as { ok: true; value: Record<string, unknown> }).value;
};

describe("parseBatchId", () => {
    it.each([[0, 0], [5, 5], [12, 12], ["12", 12], [" 7 ", 7], ["0", 0], ["012", 12]])("accepts %j -> %i", (input, expected) => {
        expect(parseBatchId(input)).toBe(expected);
    });
    it.each([
        "", " ", "abc", "1.5", "-1", "1e2", "0x10", "12th", "Infinity", "NaN", "1234567890",
        -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1,
        null, undefined, true, false, {}, [], [1], () => 1,
    ])("rejects %j", (input) => {
        expect(parseBatchId(input)).toBeNull();
    });
});

describe("validateUser", () => {
    it("accepts a normal user and returns it normalised", () => {
        expect(ok(good)).toEqual({ name: "Ada Lovelace", email: "ada@example.com", isAdmin: false, batchId: 12 });
    });
    it("trims the name and trims + lowercases the email", () => {
        expect(ok({ ...good, name: "  Ada  ", email: "  ADA@Example.COM " })).toMatchObject({ name: "Ada", email: "ada@example.com" });
    });
    it("accepts batch 0 (real batches use it) and a numeric string", () => {
        expect(ok({ ...good, batchId: 0 }).batchId).toBe(0);
        expect(ok({ ...good, batchId: "12" }).batchId).toBe(12);
    });

    describe("isAdmin", () => {
        it("defaults to false when missing or null", () => {
            expect(ok({ ...good, isAdmin: undefined }).isAdmin).toBe(false);
            expect(ok({ ...good, isAdmin: null }).isAdmin).toBe(false);
        });
        it("keeps true and false", () => {
            expect(ok({ ...good, isAdmin: true }).isAdmin).toBe(true);
            expect(ok({ ...good, isAdmin: false }).isAdmin).toBe(false);
        });
        it.each(["true", "false", "yes", "admin", 1, 0, {}, []])("rejects %j instead of guessing (the string 'false' is truthy)", (isAdmin) => {
            expect(fail({ ...good, isAdmin })).toMatch(/isAdmin/);
        });
    });

    describe("name", () => {
        it.each([undefined, null, "", "   ", 5, {}, []])("rejects %j", (name) => {
            expect(fail({ ...good, name })).toMatch(/name is required/);
        });
        it("allows 255 characters and rejects 256", () => {
            expect(validateUser({ ...good, name: "x".repeat(255) }).ok).toBe(true);
            expect(fail({ ...good, name: "x".repeat(256) })).toMatch(/255/);
        });
        it("measures after trimming", () => {
            expect(validateUser({ ...good, name: " ".repeat(10) + "x".repeat(255) }).ok).toBe(true);
        });
    });

    describe("email", () => {
        it.each([undefined, null, "", "  ", 5, {}])("rejects missing or non-string %j", (email) => {
            expect(fail({ ...good, email })).toMatch(/email is required/);
        });
        it.each(["plain", "a@b", "@x.com", "a@.com", "a b@x.com", "a@x .com", "a@@x.com", "a@x.com b"])("rejects the malformed address %j", (email) => {
            expect(fail({ ...good, email })).toMatch(/not a valid/);
        });
        it.each(["a@x.co", "first.last+tag@sub.example.org", "ü@exämple.com", "A@B.CO"])("accepts %j", (email) => {
            expect(validateUser({ ...good, email }).ok).toBe(true);
        });
        it("accepts an address of exactly 255 characters and rejects one more", () => {
            const domain = "@example.com";
            expect(validateUser({ ...good, email: "a".repeat(255 - domain.length) + domain }).ok).toBe(true);
            expect(fail({ ...good, email: "a".repeat(256 - domain.length) + domain })).toMatch(/not a valid/);
        });
    });

    describe("batchId", () => {
        it.each([undefined, null, "", "abc", 1.5, -1, true])("rejects %j", (batchId) => {
            expect(fail({ ...good, batchId })).toMatch(/batchId/);
        });
    });

    describe("not an object", () => {
        it.each([null, undefined, "x", 5, true, [], [good]])("rejects %j", (u) => {
            expect(fail(u)).toMatch(/object/);
        });
    });

    it("drops unknown fields so they can never reach the database layer", () => {
        expect(Object.keys(ok({ ...good, id: 1, password: "x", created_at: "now" })).sort()).toEqual(["batchId", "email", "isAdmin", "name"]);
    });

    it("does not mutate its input", () => {
        const input = { ...good, name: " Ada ", email: " ADA@X.COM " };
        const copy = { ...input };
        validateUser(input);
        expect(input).toEqual(copy);
    });
});

it("caps bulk imports at a size one request can finish", () => {
    expect(MAX_BULK_USERS).toBeGreaterThanOrEqual(500);
    expect(MAX_BULK_USERS).toBeLessThanOrEqual(5000);
});
