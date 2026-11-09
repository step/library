// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildCode } from "../qr";

// Uses the real `qrcode` package on purpose: the original crash ("reading 'NaN'") came from calling
// the matrix's `get` without its `this`, which a mock would never reproduce.
const ID = "1762700000000-3f2b8c1e-9d4a-4c6e-8f1a-2b7d5e9a0c11";

describe("buildCode", () => {
    it("does not throw for a timestamp-uuid id (regression: Cannot read properties of undefined (reading 'NaN'))", async () => {
        await expect(buildCode(ID)).resolves.toBeDefined();
    });

    it("returns the id, a square size and a non-empty path", async () => {
        const code = await buildCode(ID);
        expect(code.id).toBe(ID);
        expect(Number.isInteger(code.size)).toBe(true);
        expect(code.size).toBeGreaterThanOrEqual(21);
        expect(code.d.length).toBeGreaterThan(0);
    });

    it("has a size that follows the QR version formula 17 + 4 * version", async () => {
        const { size } = await buildCode(ID);
        expect((size - 17) % 4).toBe(0);
    });

    it("is deterministic for the same id", async () => {
        expect(await buildCode(ID)).toEqual(await buildCode(ID));
    });

    it("differs for different ids", async () => {
        const a = await buildCode(ID);
        const b = await buildCode(ID.replace(/.$/, "2"));
        expect(a.d).not.toBe(b.d);
    });

    it("only draws squares inside the grid", async () => {
        const { d, size } = await buildCode(ID);
        const squares = [...d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)];
        expect(squares.length).toBeGreaterThan(0);
        for (const [, x, y] of squares) {
            expect(Number(x)).toBeGreaterThanOrEqual(0);
            expect(Number(x)).toBeLessThan(size);
            expect(Number(y)).toBeGreaterThanOrEqual(0);
            expect(Number(y)).toBeLessThan(size);
        }
    });

    it("path contains nothing but square commands", async () => {
        const { d } = await buildCode(ID);
        expect(d.replace(/M\d+ \d+h1v1h-1z/g, "")).toBe("");
    });

    it("draws the three finder patterns' corner squares", async () => {
        const { d, size } = await buildCode(ID);
        expect(d).toContain("M0 0h1v1h-1z");
        expect(d).toContain(`M${size - 1} 0h1v1h-1z`);
        expect(d).toContain(`M0 ${size - 1}h1v1h-1z`);
        expect(d).not.toContain(`M${size - 1} ${size - 1}h1v1h-1z`); // bottom-right corner is data, not a finder
    });

    it("handles short, long and non-ascii ids", async () => {
        for (const id of ["a", "x".repeat(200), "книга-📚"]) {
            const code = await buildCode(id);
            expect(code.d.length).toBeGreaterThan(0);
        }
    });

    it("longer ids need a bigger grid", async () => {
        const small = await buildCode("a");
        const big = await buildCode("x".repeat(200));
        expect(big.size).toBeGreaterThan(small.size);
    });

    it("encodes the id: decoding the matrix gives back the same payload", async () => {
        const QRCode = await import("qrcode");
        const qr = QRCode.create(ID, { errorCorrectionLevel: "M" });
        const { d, size } = await buildCode(ID);
        const drawn = new Set([...d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(m => `${m[1]},${m[2]}`));
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                expect(drawn.has(`${c},${r}`)).toBe(!!qr.modules.get(r, c));
            }
        }
    });
});
