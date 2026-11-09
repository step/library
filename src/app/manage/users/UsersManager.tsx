"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Upload } from "lucide-react";
import { User } from "@/types/User";
import { useSnackbar } from "@/utils/useSnackbar";
import Snackbar from "@/components/Snackbar";
import LoaderOverlay from "@/components/LoaderOverlay";
import ConfirmDialog from "@/components/manage/ConfirmDialog";
import FieldError from "@/components/manage/FieldError";

type CsvRow = { name: string; email: string; isAdmin: boolean; batchId: number };
type Csv = { fileName: string; rows: CsvRow[]; skipped: number };
type FormState = { name: string; email: string; batch: string; admin: boolean };
type FormErrors = Partial<Record<"name" | "email" | "batch", string>>;

const EMPTY_FORM: FormState = { name: "", email: "", batch: "", admin: false };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const parseCSV = (text: string): { rows: CsvRow[]; skipped: number } => {
    const lines = text.trim().split("\n").filter(l => l.trim());
    const rows: CsvRow[] = [];
    let skipped = 0;
    for (const line of lines) {
        const parts = line.split(",").map(p => p.trim());
        const [name, email, batchIdRaw, adminFlag] = parts;
        const batchId = Number(batchIdRaw);
        if (parts.length < 3 || !name || !email || !Number.isInteger(batchId)) {
            skipped++;
            continue;
        }
        rows.push({ name, email, batchId, isAdmin: adminFlag?.toLowerCase() === "true" });
    }
    return { rows, skipped };
};

export default function UsersManager({ initialUsers }: { initialUsers: User[] }) {
    const [users, setUsers] = useState<User[]>(initialUsers);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [errors, setErrors] = useState<FormErrors>({});
    const [csv, setCsv] = useState<Csv | null>(null);
    const [summary, setSummary] = useState("");
    const [adding, setAdding] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [pendingId, setPendingId] = useState<number | null>(null);
    const [confirmUser, setConfirmUser] = useState<User | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const { snackbar, showSuccess, showError, close } = useSnackbar();

    const busy = adding || uploading || pendingId !== null;

    const setField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setForm({ ...form, [key]: key === "admin" ? e.target.checked : e.target.value });
        if (key !== "admin") setErrors({ ...errors, [key]: undefined });
    };

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (busy) return;
        const email = form.email.trim();
        const errs: FormErrors = {};
        if (!form.name.trim()) errs.name = "Enter a name";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email address";
        if (!/^[1-9][0-9]*$/.test(form.batch.trim())) errs.batch = "Enter a batch number, for example 12";
        if (Object.keys(errs).length) {
            setErrors(errs);
            return;
        }
        setAdding(true);
        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: form.name.trim(), email, isAdmin: form.admin, batchId: Number(form.batch) }),
            });
            const data = await res.json();
            if (res.ok) {
                setUsers(prev => [data.user, ...prev]);
                setForm(EMPTY_FORM);
                setErrors({});
                showSuccess("User added");
            } else if (res.status === 409) {
                setErrors({ email: "A user with this email already exists." });
            } else {
                showError(data.error || "Failed to add user");
            }
        } catch {
            showError("Failed to add user");
        } finally {
            setAdding(false);
        }
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSummary("");
        const reader = new FileReader();
        reader.onload = ev => {
            const { rows, skipped } = parseCSV(String(ev.target?.result ?? ""));
            if (rows.length === 0) {
                setCsv(null);
                showError("Bulk upload failed");
                return;
            }
            setCsv({ fileName: file.name, rows, skipped });
        };
        reader.onerror = () => showError("Bulk upload failed");
        reader.readAsText(file);
    };

    const handleUpload = async () => {
        if (!csv || busy) return;
        setUploading(true);
        try {
            const res = await fetch("/api/users/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ users: csv.rows }),
            });
            const data = await res.json();
            if (res.ok) {
                setUsers(prev => [...data.users, ...prev]);
                const message = `${plural(data.added, "user")} added, ${data.skipped + csv.skipped} skipped.`;
                setSummary(message);
                showSuccess(message);
                setCsv(null);
                if (fileRef.current) fileRef.current.value = "";
            } else {
                showError(data.error || "Bulk upload failed");
            }
        } catch {
            showError("Bulk upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleToggle = async (user: User) => {
        if (busy) return;
        setPendingId(user.id);
        try {
            const res = await fetch(`/api/users/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isAdmin: !user.isAdmin }),
            });
            if (res.ok) {
                setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, isAdmin: !user.isAdmin } : u)));
                showSuccess(`Role updated to ${user.isAdmin ? "User" : "Admin"}`);
            } else {
                showError("Failed to update role");
            }
        } catch {
            showError("Failed to update role");
        } finally {
            setPendingId(null);
        }
    };

    const handleRemove = async () => {
        const user = confirmUser;
        if (!user) return;
        setConfirmUser(null);
        setPendingId(user.id);
        try {
            const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
            if (res.ok) {
                setUsers(prev => prev.filter(u => u.id !== user.id));
                showSuccess("User removed");
            } else {
                showError("Failed to delete user");
            }
        } catch {
            showError("Failed to delete user");
        } finally {
            setPendingId(null);
        }
    };

    return (
        <>
            <section className="mg-card" aria-labelledby="add-h">
                <h2 className="mg-h2" id="add-h">Add a user</h2>
                <form className="mg-form" onSubmit={handleAdd} noValidate>
                    <div className="mg-field">
                        <label className="mg-label" htmlFor="f-name">Name</label>
                        <input id="f-name" className={`mg-input ${errors.name ? "is-invalid" : ""}`} type="text" autoComplete="off"
                            aria-invalid={!!errors.name} aria-describedby="e-name" value={form.name} onChange={setField("name")} />
                        <FieldError id="e-name" message={errors.name} />
                    </div>
                    <div className="mg-field">
                        <label className="mg-label" htmlFor="f-email">Email</label>
                        <input id="f-email" className={`mg-input ${errors.email ? "is-invalid" : ""}`} type="text" inputMode="email" autoComplete="off"
                            aria-invalid={!!errors.email} aria-describedby="e-email" value={form.email} onChange={setField("email")} />
                        <FieldError id="e-email" message={errors.email} />
                    </div>
                    <div className="mg-field">
                        <label className="mg-label" htmlFor="f-batch">Batch</label>
                        <input id="f-batch" className={`mg-input ${errors.batch ? "is-invalid" : ""}`} type="text" inputMode="numeric" autoComplete="off"
                            aria-invalid={!!errors.batch} aria-describedby="e-batch" value={form.batch} onChange={setField("batch")} />
                        <FieldError id="e-batch" message={errors.batch} />
                    </div>
                    <div className="mg-field mg-field-switch">
                        <label className="mg-switch">
                            <input type="checkbox" checked={form.admin} onChange={setField("admin")} />
                            <span className="mg-track" aria-hidden="true"></span>
                            <span>Make this user an admin</span>
                        </label>
                    </div>
                    <div className="mg-form-actions">
                        <button className="mg-btn" type="submit" disabled={busy}>{adding ? "Adding..." : "Add user"}</button>
                    </div>
                </form>
            </section>

            <section className="mg-card" id="bulk-card" aria-labelledby="bulk-h">
                <h2 className="mg-h2" id="bulk-h">Bulk upload via CSV</h2>
                <p className="mg-help">
                    Choose a .csv file with the columns <code>name,email,batch_id,is_admin</code>. The is_admin column is optional (true or false).
                    Rows with missing or invalid values are skipped.
                </p>
                <div className="mg-file-row">
                    <label className="mg-btn-outline mg-file">
                        <Upload size={18} aria-hidden="true" />
                        <span>Choose CSV file</span>
                        <input ref={fileRef} className="mg-sr" type="file" accept=".csv,text/csv" onChange={handleFile} disabled={busy} />
                    </label>
                    {csv && <span className="mg-fname">{csv.fileName}</span>}
                </div>
                {csv && (
                    <div className="mg-preview">
                        <p className="mg-preview-h">{plural(csv.rows.length, "user")} ready to import</p>
                        <ul className="mg-prev-list">
                            {csv.rows.slice(0, 5).map((r, i) => (
                                <li className="mg-prev-row" key={i}>
                                    <div className="mg-prev-main">
                                        <span className="mg-t">{r.name}</span>
                                        <span className="mg-a mg-ellip">{r.email}</span>
                                    </div>
                                    <span className="mg-prev-batch">Batch {r.batchId}</span>
                                    {r.isAdmin && <span className="mg-badge mg-badge-admin">Admin</span>}
                                </li>
                            ))}
                        </ul>
                        {csv.rows.length > 5 && <p className="mg-more">+{csv.rows.length - 5} more</p>}
                        {csv.skipped > 0 && (
                            <p className="mg-help mg-help-tight">{plural(csv.skipped, "row")} will be skipped because of missing or invalid values.</p>
                        )}
                        <div className="mg-form-actions">
                            <button className="mg-btn" disabled={busy} onClick={handleUpload}>
                                {uploading ? "Uploading..." : `Upload ${plural(csv.rows.length, "user")}`}
                            </button>
                        </div>
                    </div>
                )}
                {summary && (
                    <p className="mg-success">
                        <CheckCircle2 size={18} aria-hidden="true" />
                        <span>{summary}</span>
                    </p>
                )}
            </section>

            <h2 className="mg-h2 mg-h2-gap" id="users-h">All users ({users.length})</h2>
            <div className="mg-table">
                <div className="mg-thead mg-cols-users">
                    <span>Name and email</span><span>Batch</span><span>Role</span><span className="mg-ta-r">Actions</span>
                </div>
                <ul className="mg-list">
                    {users.map(user => (
                        <li className="mg-row mg-cols-users" key={user.id}>
                            <div className="mg-ttl">
                                <div className="mg-t">{user.name}</div>
                                <div className="mg-a mg-ellip">{user.email}</div>
                            </div>
                            <div className="mg-umeta">
                                <span className="mg-ubatch">Batch {user.batchId}</span>
                                <span>
                                    <span className={`mg-badge ${user.isAdmin ? "mg-badge-admin" : "mg-badge-user"}`}>{user.isAdmin ? "Admin" : "User"}</span>
                                </span>
                            </div>
                            <div className="mg-uact">
                                <button className="mg-btn-sm" disabled={busy} onClick={() => handleToggle(user)}>
                                    {user.isAdmin ? "Make user" : "Make admin"}
                                </button>
                                <button className="mg-btn-sm mg-btn-danger" disabled={busy} aria-label={`Remove ${user.name}`} onClick={() => setConfirmUser(user)}>
                                    Remove
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
            {users.length === 0 && (
                <div className="mg-empty"><p className="mg-empty-t">No users found.</p></div>
            )}

            {confirmUser && (
                <ConfirmDialog
                    title={`Remove ${confirmUser.name} from the library?`}
                    description="They will be signed out and lose access to the library. This cannot be undone."
                    confirmLabel="Remove user"
                    onConfirm={handleRemove}
                    onCancel={() => setConfirmUser(null)}
                />
            )}
            {uploading && <LoaderOverlay title="Uploading..." message="Adding users to the library. Please keep this page open." />}
            <Snackbar isOpen={snackbar.isOpen} message={snackbar.message} type={snackbar.type} onClose={close} />
        </>
    );
}
