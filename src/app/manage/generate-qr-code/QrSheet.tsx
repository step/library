"use client";
import { useEffect, useState } from "react";
import { Minus, Plus, Printer } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import FieldError from "@/components/manage/FieldError";

const MAX_CODES = 200;

type Code = { id: string; d: string; size: number };

const buildCode = async (id: string): Promise<Code> => {
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

const QrSheet = () => {
    const [input, setInput] = useState("12");
    const [error, setError] = useState("");
    const [ids, setIds] = useState<string[]>([]);
    const [codes, setCodes] = useState<Code[]>([]);

    useEffect(() => {
        let cancelled = false;
        Promise.all(ids.map(buildCode)).then(result => {
            if (!cancelled) setCodes(result);
        });
        return () => { cancelled = true; };
    }, [ids]);

    const step = (delta: number) => {
        const current = parseInt(input, 10);
        const next = Math.min(MAX_CODES, Math.max(1, (Number.isNaN(current) ? 0 : current) + delta));
        setInput(String(next));
        setError("");
    };

    const generate = (e: React.FormEvent) => {
        e.preventDefault();
        const count = Number(input.trim());
        if (!Number.isInteger(count) || count <= 0) {
            setError("Please enter a valid number of QR codes.");
            return;
        }
        if (count > MAX_CODES) {
            setError(`You can generate up to ${MAX_CODES} codes at a time.`);
            return;
        }
        setError("");
        const time = Date.now();
        setCodes([]);
        setIds(Array.from({ length: count }, () => `${time}-${uuidv4()}`));
    };

    const generating = ids.length > 0 && codes.length !== ids.length;

    return (
        <>
            <section className="mg-card mg-noprint" aria-label="Number of codes">
                <form className="mg-qr-form" onSubmit={generate} noValidate>
                    <div className="mg-field">
                        <label className="mg-label" htmlFor="q-n">Number of QR codes</label>
                        <div className="mg-step">
                            <button type="button" className="mg-step-b" aria-label="Fewer codes" onClick={() => step(-1)}>
                                <Minus size={20} aria-hidden="true" />
                            </button>
                            <input id="q-n" className={`mg-input mg-step-i ${error ? "is-invalid" : ""}`} type="text" inputMode="numeric" autoComplete="off"
                                aria-invalid={!!error} aria-describedby="q-err" value={input}
                                onChange={e => { setInput(e.target.value); setError(""); }} />
                            <button type="button" className="mg-step-b" aria-label="More codes" onClick={() => step(1)}>
                                <Plus size={20} aria-hidden="true" />
                            </button>
                        </div>
                        <FieldError id="q-err" message={error} />
                    </div>
                    <button className="mg-btn mg-qr-go" type="submit">Generate</button>
                </form>
            </section>

            <div className="mg-qr-head mg-noprint">
                <h2 className="mg-h2">
                    {generating ? "Generating..." : codes.length > 0 ? `${codes.length} QR ${codes.length === 1 ? "code" : "codes"}` : "QR codes"}
                </h2>
                <button className="mg-btn-outline mg-print" onClick={() => window.print()} disabled={codes.length === 0}>
                    <Printer size={18} aria-hidden="true" />
                    <span>Print sheet</span>
                </button>
            </div>

            {codes.length === 0 ? (
                <div className="mg-empty mg-noprint">
                    <p className="mg-empty-t">{generating ? "Generating your codes..." : "No codes yet"}</p>
                    {!generating && <p className="mg-empty-s">Choose how many you need and select Generate.</p>}
                </div>
            ) : (
                <div className="mg-qr-sheet">
                    <ul className="mg-qr-grid">
                        {codes.map((code, index) => (
                            <li className="mg-qr" key={code.id}>
                                <svg className="mg-qr-svg" viewBox={`-2 -2 ${code.size + 4} ${code.size + 4}`} role="img" aria-label={`QR code ${index + 1}`}>
                                    <rect x="-2" y="-2" width={code.size + 4} height={code.size + 4} fill="#FFFFFF" />
                                    <path d={code.d} fill="#212526" fillRule="evenodd" />
                                </svg>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </>
    );
};

export default QrSheet;
