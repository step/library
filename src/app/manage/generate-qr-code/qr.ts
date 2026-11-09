export type Code = { id: string; d: string; size: number };

/** Builds the SVG path for a QR code. Pure given `id`, apart from the lazy `qrcode` import. */
export const buildCode = async (id: string): Promise<Code> => {
    const QRCode = await import("qrcode");
    // Keep the matrix intact: `get` reads `this.data`, so it must be called as a method.
    const modules = QRCode.create(id, { errorCorrectionLevel: "M" }).modules;
    const size = modules.size;
    let d = "";
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (modules.get(row, col)) d += `M${col} ${row}h1v1h-1z`;
        }
    }
    return { id, d, size };
};
