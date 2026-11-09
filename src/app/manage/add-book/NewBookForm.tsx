"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Barcode, QrCode, X } from "lucide-react";
import LoadingSpinner from "@/components/LoadingSpinner";
import LoaderOverlay from "@/components/LoaderOverlay";
import Snackbar from "@/components/Snackbar";
import FieldError from "@/components/manage/FieldError";
import { useSnackbar } from "@/utils/useSnackbar";

// Dynamic import for BarcodeScanner to reduce bundle size
const BarcodeScanner = dynamic(() => import("@/components/BarcodeScanner"), {
    loading: () => <LoadingSpinner size="medium" message="Loading scanner..." />,
    ssr: false
});

type BookDetails = { title: string; authors: string; isbn10: string; isbn13: string };
type Errors = Partial<Record<keyof BookDetails, string>>;

const EMPTY: BookDetails = { title: "", authors: "", isbn10: "", isbn13: "" };

const NewBookForm = () => {
    const [book, setBook] = useState<BookDetails>(EMPTY);
    const [errors, setErrors] = useState<Errors>({});
    const [copies, setCopies] = useState<string[]>([]);
    const [scanning, setScanning] = useState<"isbn" | "copy" | null>(null);
    const [loading, setLoading] = useState(false);
    const { snackbar, showSuccess, showError, close } = useSnackbar();

    const setField = (key: keyof BookDetails) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setBook({ ...book, [key]: e.target.value });
        const next = { ...errors, [key]: undefined };
        if (key === "isbn10" || key === "isbn13") {
            if (next.isbn13 === "Enter at least one ISBN") next.isbn13 = undefined;
        }
        setErrors(next);
    };

    const handleCopyScan = (code: string) => {
        setScanning(null);
        setCopies(prev => (prev.includes(code) ? prev : [...prev, code]));
    };

    const prefillFromIsbn = async (barcode: string) => {
        setScanning(null);
        setLoading(true);
        try {
            const res = await fetch(`/api/book?barcode=${encodeURIComponent(barcode)}`);
            const data = await res.json();
            if (res.status === 200) {
                setBook({
                    title: data.title,
                    authors: data.authors,
                    isbn10: data.isbn10 || "",
                    isbn13: data.isbn13 || "",
                });
                setErrors({});
            } else {
                showError("Book not found. Please check the ISBN or add it manually.");
            }
        } catch {
            showError("Book not found. Please check the ISBN or add it manually.");
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (loading) return;
        const isbn10 = book.isbn10.replace(/[\s-]/g, "");
        const isbn13 = book.isbn13.replace(/[\s-]/g, "");
        const errs: Errors = {};
        if (book.title.trim().length < 2) errs.title = "Enter a title";
        if (book.authors.trim().length < 2) errs.authors = "Enter at least one author";
        if (isbn10 && !/^[0-9]{9}[0-9Xx]$/.test(isbn10)) errs.isbn10 = "ISBN 10 must have 10 characters (the last can be X)";
        if (isbn13 && !/^[0-9]{13}$/.test(isbn13)) errs.isbn13 = "ISBN 13 must have 13 digits";
        if (!isbn10 && !isbn13) errs.isbn13 = "Enter at least one ISBN";
        if (Object.keys(errs).length) {
            setErrors(errs);
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/books/on-board", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: book.title.trim(),
                    authors: book.authors.trim(),
                    ...(isbn10 && { isbn10 }),
                    ...(isbn13 && { isbn13 }),
                    copies,
                }),
            });
            if (res.ok) {
                showSuccess("Successfully added book!");
                setBook(EMPTY);
                setCopies([]);
                setErrors({});
            } else {
                showError("Failed to add book!");
            }
        } catch {
            showError("Failed to add book!");
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {loading && <LoaderOverlay title="Loading" message="Please wait while we process your request." />}

            <section className="mg-card" aria-label="Scan options">
                <div className="mg-scan-opts">
                    <button type="button" className="mg-opt" onClick={() => setScanning("isbn")}>
                        <span className="mg-opt-ic"><Barcode size={22} aria-hidden="true" /></span>
                        <span className="mg-opt-tx">
                            <span className="mg-opt-t">Scan ISBN</span>
                            <span className="mg-opt-d">Fill the form from the barcode on the back cover.</span>
                        </span>
                    </button>
                    <button type="button" className="mg-opt" onClick={() => setScanning("copy")}>
                        <span className="mg-opt-ic"><QrCode size={22} aria-hidden="true" /></span>
                        <span className="mg-opt-tx">
                            <span className="mg-opt-t">Scan copy QR code</span>
                            <span className="mg-opt-d">Add a copy that already has a library QR label.</span>
                        </span>
                    </button>
                </div>
            </section>

            <section className="mg-card" aria-labelledby="bk-h">
                <h2 className="mg-h2" id="bk-h">Book details</h2>
                <form className="mg-form" onSubmit={handleSubmit} noValidate>
                    <div className="mg-field mg-field-wide">
                        <label className="mg-label" htmlFor="b-title">Title</label>
                        <input id="b-title" className={`mg-input ${errors.title ? "is-invalid" : ""}`} type="text" autoComplete="off"
                            aria-invalid={!!errors.title} aria-describedby="eb-title" value={book.title} onChange={setField("title")} />
                        <FieldError id="eb-title" message={errors.title} />
                    </div>
                    <div className="mg-field mg-field-wide">
                        <label className="mg-label" htmlFor="b-authors">Authors</label>
                        <input id="b-authors" className={`mg-input ${errors.authors ? "is-invalid" : ""}`} type="text" autoComplete="off"
                            aria-invalid={!!errors.authors} aria-describedby="eb-authors" value={book.authors} onChange={setField("authors")} />
                        <p className="mg-hint">Separate multiple authors with commas.</p>
                        <FieldError id="eb-authors" message={errors.authors} />
                    </div>
                    <div className="mg-field">
                        <label className="mg-label" htmlFor="b-isbn10">ISBN 10</label>
                        <input id="b-isbn10" className={`mg-input ${errors.isbn10 ? "is-invalid" : ""}`} type="text" autoComplete="off"
                            aria-invalid={!!errors.isbn10} aria-describedby="eb-isbn10" value={book.isbn10} onChange={setField("isbn10")} />
                        <FieldError id="eb-isbn10" message={errors.isbn10} />
                    </div>
                    <div className="mg-field">
                        <label className="mg-label" htmlFor="b-isbn13">ISBN 13</label>
                        <input id="b-isbn13" className={`mg-input ${errors.isbn13 ? "is-invalid" : ""}`} type="text" inputMode="numeric" autoComplete="off"
                            aria-invalid={!!errors.isbn13} aria-describedby="eb-isbn13" value={book.isbn13} onChange={setField("isbn13")} />
                        <FieldError id="eb-isbn13" message={errors.isbn13} />
                    </div>
                    <div className="mg-field mg-field-wide">
                        <span className="mg-label">Copies</span>
                        {copies.length === 0 ? (
                            <p className="mg-hint">No copies yet. You can add copies later, or scan a copy QR code to add one now.</p>
                        ) : (
                            <ul className="mg-copies" aria-label="Copies to add">
                                {copies.map(code => (
                                    <li className="mg-chip" key={code}>
                                        <span className="mg-chip-t">{code}</span>
                                        <button type="button" className="mg-chip-x" aria-label={`Remove copy ${code}`}
                                            onClick={() => setCopies(copies.filter(c => c !== code))}>
                                            <X size={16} aria-hidden="true" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="mg-form-actions">
                        <button className="mg-btn" type="submit" disabled={loading}>{loading ? "Adding..." : "Add book"}</button>
                    </div>
                </form>
            </section>

            <BarcodeScanner
                onResult={prefillFromIsbn}
                onError={() => setScanning(null)}
                opened={scanning === "isbn"}
                onCancel={() => setScanning(null)} />
            <BarcodeScanner
                onResult={handleCopyScan}
                onError={() => setScanning(null)}
                opened={scanning === "copy"}
                onCancel={() => setScanning(null)} />
            <Snackbar isOpen={snackbar.isOpen} message={snackbar.message} type={snackbar.type} onClose={close} />
        </>
    );
};

export default NewBookForm;
