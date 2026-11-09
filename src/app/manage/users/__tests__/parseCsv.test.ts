import { describe, it, expect } from "vitest";
import { parseCSV } from "../parseCsv";

const row = (name: string, email: string, batchId: number, isAdmin = false) => ({ name, email, batchId, isAdmin });

describe("parseCSV", () => {
    describe("valid input", () => {
        it("parses name, email and batch", () => {
            expect(parseCSV("Ada,ada@x.com,12")).toEqual({ rows: [row("Ada", "ada@x.com", 12)], skipped: 0 });
        });
        it("parses several lines in order", () => {
            const { rows } = parseCSV("A,a@x.com,1\nB,b@x.com,2\nC,c@x.com,3");
            expect(rows.map(r => r.name)).toEqual(["A", "B", "C"]);
        });
        it("reads the optional admin column case-insensitively", () => {
            const { rows } = parseCSV("A,a@x.com,1,true\nB,b@x.com,1,TRUE\nC,c@x.com,1,True");
            expect(rows.every(r => r.isAdmin)).toBe(true);
        });
        it.each(["false", "yes", "1", "", "admin", "t"])("treats %j as not admin", (flag) => {
            expect(parseCSV(`A,a@x.com,1,${flag}`).rows[0].isAdmin).toBe(false);
        });
        it("trims whitespace around every field", () => {
            expect(parseCSV("  Ada  ,  ada@x.com ,  12 , true ").rows[0]).toEqual(row("Ada", "ada@x.com", 12, true));
        });
        it("ignores extra columns", () => {
            expect(parseCSV("A,a@x.com,1,false,notes,more").rows).toEqual([row("A", "a@x.com", 1)]);
        });
        it("accepts batch 0 and numbers written as 012", () => {
            expect(parseCSV("A,a@x.com,0").rows[0].batchId).toBe(0);
            expect(parseCSV("A,a@x.com,012").rows[0].batchId).toBe(12);
        });
    });

    describe("line endings and encoding", () => {
        it("handles Windows line endings without leaving a \\r in the last column", () => {
            const { rows } = parseCSV("A,a@x.com,1,true\r\nB,b@x.com,2,true\r\n");
            expect(rows).toEqual([row("A", "a@x.com", 1, true), row("B", "b@x.com", 2, true)]);
        });
        it("handles old Mac line endings", () => {
            expect(parseCSV("A,a@x.com,1\rB,b@x.com,2").rows).toHaveLength(2);
        });
        it("strips a UTF-8 byte order mark from the first name", () => {
            expect(parseCSV("﻿Ada,ada@x.com,1").rows[0].name).toBe("Ada");
        });
        it("keeps unicode names intact", () => {
            expect(parseCSV("Zoë Müller,zoe@x.com,3\n李雷,li@x.com,4").rows.map(r => r.name)).toEqual(["Zoë Müller", "李雷"]);
        });
    });

    describe("quoted fields", () => {
        it("keeps a comma inside quotes", () => {
            expect(parseCSV('"Smith, Jo",jo@x.com,5').rows[0]).toEqual(row("Smith, Jo", "jo@x.com", 5));
        });
        it("unescapes doubled quotes", () => {
            expect(parseCSV('"Jo ""JJ"" Smith",jo@x.com,5').rows[0].name).toBe('Jo "JJ" Smith');
        });
        it("accepts quotes around every field", () => {
            expect(parseCSV('"A","a@x.com","1","true"').rows[0]).toEqual(row("A", "a@x.com", 1, true));
        });
        it("does not hang or throw on an unterminated quote", () => {
            expect(() => parseCSV('"Jo,jo@x.com,5')).not.toThrow();
        });
    });

    describe("rows that are skipped", () => {
        it("counts a header row as skipped", () => {
            expect(parseCSV("name,email,batch,admin\nA,a@x.com,1")).toEqual({ rows: [row("A", "a@x.com", 1)], skipped: 1 });
        });
        it.each([
            ["too few columns", "A,a@x.com"],
            ["one column", "A"],
            ["empty name", ",a@x.com,1"],
            ["empty email", "A,,1"],
            ["empty batch (would otherwise become 0)", "A,a@x.com,"],
            ["text batch", "A,a@x.com,abc"],
            ["decimal batch", "A,a@x.com,1.5"],
            ["batch with units", "A,a@x.com,12th"],
        ])("skips %s", (_name, line) => {
            expect(parseCSV(line)).toEqual({ rows: [], skipped: 1 });
        });
        it("keeps good rows around bad ones and counts only the bad ones", () => {
            const r = parseCSV("A,a@x.com,1\nbad\nB,b@x.com,2\nalso,bad\nC,c@x.com,3");
            expect(r.rows).toHaveLength(3);
            expect(r.skipped).toBe(2);
        });
        it("does not count blank lines as skipped", () => {
            expect(parseCSV("\n\nA,a@x.com,1\n   \n\nB,b@x.com,2\n\n")).toMatchObject({ skipped: 0 });
        });
    });

    describe("degenerate input", () => {
        it.each(["", " ", "\n", "\r\n\r\n", "   \n   "])("returns nothing for %j", (text) => {
            expect(parseCSV(text)).toEqual({ rows: [], skipped: 0 });
        });
        it("does not de-duplicate (the server reports duplicates as skipped)", () => {
            expect(parseCSV("A,a@x.com,1\nA,a@x.com,1").rows).toHaveLength(2);
        });
        it("does not validate the email format (the server and form do)", () => {
            expect(parseCSV("A,not-an-email,1").rows).toHaveLength(1);
        });
        it("handles 10,000 lines quickly", () => {
            const text = Array.from({ length: 10000 }, (_, i) => `User ${i},u${i}@x.com,${i % 12}`).join("\n");
            const t = performance.now();
            expect(parseCSV(text).rows).toHaveLength(10000);
            expect(performance.now() - t).toBeLessThan(1000);
        });
    });

    describe("invariants", () => {
        it("rows + skipped equals the number of non-blank lines, for assorted junk", () => {
            const junk = ["a", "a,b", "a,b,c", "a,b,1", ",,", '"', '"a,b,1', "a,b,1,true", "  ", "x,y,-3", "x,y,1e2", "x,y,0x10"];
            for (let i = 0; i < junk.length; i++) {
                const lines = junk.slice(0, i + 1);
                const { rows, skipped } = parseCSV(lines.join("\n"));
                expect(rows.length + skipped).toBe(lines.filter(l => l.trim()).length);
            }
        });
        it("never produces a non-integer batch", () => {
            for (const b of ["1", "1.0", "1e2", "0x10", "-3", " 7 ", "Infinity", "NaN"]) {
                const { rows } = parseCSV(`A,a@x.com,${b}`);
                for (const r of rows) expect(Number.isInteger(r.batchId)).toBe(true);
            }
        });
    });
});
