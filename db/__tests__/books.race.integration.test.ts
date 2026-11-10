// Simulates the moment two admins add the same new book: the lookup finds nothing, then another
// request creates the book before this one inserts. A real race is too rare to test reliably.
import { describe, it, expect, vi } from "vitest";
import { q } from "../../test/integration/fixtures";

const hide = vi.hoisted(() => ({ firstLookup: false }));
vi.mock("@neondatabase/serverless", async () => {
    const real = await import("../../test/integration/pgNeon");
    return {
        ...real,
        neon: (url: string) => {
            const run = real.neon(url);
            return async (strings: TemplateStringsArray, ...values: unknown[]) => {
                if (hide.firstLookup && /SELECT id FROM books/.test(strings.join("?"))) {
                    hide.firstLookup = false;
                    return []; // "nobody has created it yet"
                }
                return run(strings, ...values);
            };
        },
    };
});

import { onboardBook } from "../books";

describe("onboardBook when another request creates the same book first", () => {
    it("adds its copies to the book that now exists instead of failing", async () => {
        await q(`INSERT INTO books (title, authors, isbn10) VALUES ('Dune','FH','0441172717')`);
        hide.firstLookup = true;
        await onboardBook({ title: "Dune", authors: "FH", isbn10: "0441172717", copies: ["c1", "c2"] });
        expect(await q(`SELECT 1 FROM books`)).toHaveLength(1);
        expect((await q(`SELECT count FROM books`))[0].count).toBe(2);
    });

    it("still fails when the insert fails for another reason", async () => {
        hide.firstLookup = true;
        await expect(onboardBook({ title: null as unknown as string, authors: "x", isbn10: "0441172717", copies: [] })).rejects.toMatchObject({ code: "23502" });
    });
});
