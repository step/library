import { describe, it, expect } from "vitest";
import { validateOnboardBody, MAX_COPIES } from "../validate";

const valid = { title: "Dune", authors: "Frank Herbert", isbn10: "0441172717", copies: ["qr-1", "qr-2"] };
const fail = (body: unknown) => {
    const r = validateOnboardBody(body);
    expect(r.ok).toBe(false);
    return (r as { ok: false; message: string }).message;
};
const ok = (body: unknown) => {
    const r = validateOnboardBody(body);
    expect(r.ok).toBe(true);
    return (r as { ok: true; value: ReturnType<typeof Object> }).value as Record<string, unknown>;
};

describe("validateOnboardBody", () => {
    describe("body shape", () => {
        it.each([null, undefined, "x", 12, true, [], [valid]])("rejects %j", (body) => {
            expect(fail(body)).toMatch(/JSON object/);
        });
    });

    describe("title and authors", () => {
        it.each([undefined, null, "", " ", "a", " a ", 5, {}, []])("rejects title %j", (title) => {
            expect(fail({ ...valid, title })).toBe("Title is required");
        });
        it("accepts a two-character title (the form's minimum) and rejects one character", () => {
            expect(ok({ ...valid, title: "Up" }).title).toBe("Up");
            fail({ ...valid, title: "U" });
        });
        it.each([undefined, null, "", "  ", "x", 5])("rejects authors %j", (authors) => {
            expect(fail({ ...valid, authors })).toBe("Authors are required");
        });
        it("trims both", () => {
            const v = ok({ ...valid, title: "  Dune  ", authors: "\tFrank Herbert\n" });
            expect(v.title).toBe("Dune");
            expect(v.authors).toBe("Frank Herbert");
        });
    });

    describe("ISBNs", () => {
        it("requires at least one", () => {
            expect(fail({ ...valid, isbn10: undefined })).toBe("At least one ISBN is required");
            expect(fail({ ...valid, isbn10: "", isbn13: "" })).toBe("At least one ISBN is required");
            expect(fail({ ...valid, isbn10: null, isbn13: null })).toBe("At least one ISBN is required");
        });
        it("accepts only isbn13", () => {
            const v = ok({ ...valid, isbn10: undefined, isbn13: "9780441172719" });
            expect(v.isbn13).toBe("9780441172719");
            expect(v).not.toHaveProperty("isbn10");
        });
        it("accepts both", () => {
            const v = ok({ ...valid, isbn13: "9780441172719" });
            expect(v.isbn10).toBe("0441172717");
            expect(v.isbn13).toBe("9780441172719");
        });
        it("strips spaces and hyphens before checking and storing", () => {
            expect(ok({ ...valid, isbn10: "0-441-17271-7" }).isbn10).toBe("0441172717");
            expect(ok({ ...valid, isbn10: undefined, isbn13: "978 0 441 17271 9" }).isbn13).toBe("9780441172719");
        });
        it.each(["044117271", "04411727177", "044117271Y", "X441172717", "0441172 71X7", "abcdefghij"])("rejects isbn10 %s", (isbn10) => {
            fail({ ...valid, isbn10 });
        });
        it.each(["0441172717X", "X441172717", "044117271x"])("handles the X check digit: %s", (isbn10) => {
            const r = validateOnboardBody({ ...valid, isbn10 });
            // only a trailing X/x on a 10-char value is valid
            expect(r.ok).toBe(isbn10.length === 10 && /^[0-9]{9}[0-9Xx]$/.test(isbn10));
        });
        it.each(["978044117271", "97804411727190", "978044117271X", "97804411727 1"])("rejects isbn13 %s", (isbn13) => {
            fail({ ...valid, isbn10: undefined, isbn13 });
        });
        it("rejects non-string ISBNs without throwing", () => {
            expect(fail({ ...valid, isbn10: 441172717 })).toMatch(/isbn10 must be a string/);
            expect(fail({ ...valid, isbn13: 9780441172719 })).toMatch(/isbn13 must be a string/);
            expect(fail({ ...valid, isbn10: {} })).toMatch(/isbn10/);
        });
    });

    describe("copies", () => {
        it.each([undefined, null, "qr-1", 5, {}])("rejects copies %j", (copies) => {
            expect(fail({ ...valid, copies })).toMatch(/copies must be an array/);
        });
        it("allows an empty list (book without copies yet)", () => {
            expect(ok({ ...valid, copies: [] }).copies).toEqual([]);
        });
        it.each([[[""]], [["  "]], [[1]], [[null]], [["ok", {}]]])("rejects %j", (copies) => {
            expect(fail({ ...valid, copies })).toMatch(/non-empty string/);
        });
        it("trims and de-duplicates, keeping first-seen order", () => {
            expect(ok({ ...valid, copies: [" b ", "a", "b", "a "] }).copies).toEqual(["b", "a"]);
        });
        it(`allows exactly ${MAX_COPIES} and rejects one more`, () => {
            const many = (n: number) => Array.from({ length: n }, (_, i) => `qr-${i}`);
            expect(ok({ ...valid, copies: many(MAX_COPIES) }).copies).toHaveLength(MAX_COPIES);
            expect(fail({ ...valid, copies: many(MAX_COPIES + 1) })).toMatch(String(MAX_COPIES));
        });
    });

    it("drops unknown fields instead of passing them to the database layer", () => {
        const v = ok({ ...valid, isAdmin: true, id: 7, count: 99 });
        expect(Object.keys(v).sort()).toEqual(["authors", "copies", "isbn10", "title"]);
    });

    it("does not mutate its input", () => {
        const input = { ...valid, copies: [" a ", "a"] };
        const snapshot = JSON.parse(JSON.stringify(input));
        validateOnboardBody(input);
        expect(input).toEqual(snapshot);
    });
});
