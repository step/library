export type CsvRow = { name: string; email: string; isAdmin: boolean; batchId: number };

/** Splits one CSV line, honouring "quoted, fields" and "" as an escaped quote. */
const splitLine = (line: string): string[] => {
    const out: string[] = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quoted) {
            if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
            else if (ch === '"') quoted = false;
            else field += ch;
        } else if (ch === '"' && field.trim() === "") {
            field = "";
            quoted = true;
        } else if (ch === ",") {
            out.push(field.trim());
            field = "";
        } else {
            field += ch;
        }
    }
    out.push(field.trim());
    return out;
};

/**
 * Parses "name,email,batch[,admin]" rows. Blank lines are ignored. Rows that are
 * incomplete or have a non-integer batch (including a header row) are counted as skipped.
 */
export const parseCSV = (text: string): { rows: CsvRow[]; skipped: number } => {
    const lines = text.replace(/^﻿/, "").split(/\r\n|\n|\r/).filter(l => l.trim());
    const rows: CsvRow[] = [];
    let skipped = 0;
    for (const line of lines) {
        const parts = splitLine(line);
        const [name, email, batchIdRaw, adminFlag] = parts;
        const batchId = Number(batchIdRaw);
        if (parts.length < 3 || !name || !email || batchIdRaw === "" || !Number.isInteger(batchId)) {
            skipped++;
            continue;
        }
        rows.push({ name, email, batchId, isAdmin: adminFlag?.toLowerCase() === "true" });
    }
    return { rows, skipped };
};
