"use client";

import { useState, useTransition, useRef } from "react";
import { User } from "@/types/User";
import { useSnackbar } from "@/utils/useSnackbar";
import Snackbar from "@/components/Snackbar";
import "./users.css";

type Props = {
    initialUsers: User[];
};

const RoleBadge = ({ isAdmin }: { isAdmin: boolean }) => (
    <span className={`role-badge ${isAdmin ? "role-admin" : "role-user"}`}>
        {isAdmin ? "Admin" : "User"}
    </span>
);

const AddUserForm = ({ onAdded }: { onAdded: (user: User) => void }) => {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [batchId, setBatchId] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [isPending, startTransition] = useTransition();
    const { snackbar, showSuccess, showError, close } = useSnackbar();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || !email.trim() || !batchId.trim()) return;

        startTransition(async () => {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: name.trim(), email: email.trim(), isAdmin, batchId: Number(batchId) }),
            });
            const data = await res.json();
            if (res.ok) {
                showSuccess("User added successfully");
                onAdded(data.user);
                setName("");
                setEmail("");
                setBatchId("");
                setIsAdmin(false);
            } else {
                showError(data.error || "Failed to add user");
            }
        });
    };

    return (
        <>
            <form className="add-user-form" onSubmit={handleSubmit}>
                <h6 className="section-title">Add Single User</h6>
                <div className="add-user-fields">
                    <input
                        className="user-input"
                        placeholder="Full name"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        required
                        disabled={isPending}
                    />
                    <input
                        className="user-input"
                        placeholder="Email address"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        disabled={isPending}
                    />
                    <input
                        className="user-input"
                        placeholder="Batch ID"
                        type="number"
                        value={batchId}
                        onChange={e => setBatchId(e.target.value)}
                        required
                        disabled={isPending}
                    />
                    <label className="admin-checkbox">
                        <input
                            type="checkbox"
                            checked={isAdmin}
                            onChange={e => setIsAdmin(e.target.checked)}
                            disabled={isPending}
                        />
                        Admin
                    </label>
                    <button className="action-btn add-btn" type="submit" disabled={isPending}>
                        {isPending ? "Adding..." : "Add User"}
                    </button>
                </div>
            </form>
            <Snackbar isOpen={snackbar.isOpen} message={snackbar.message} type={snackbar.type} onClose={close} />
        </>
    );
};

const BulkUpload = ({ onAdded }: { onAdded: (users: User[]) => void }) => {
    const [isPending, startTransition] = useTransition();
    const [preview, setPreview] = useState<{ name: string; email: string; isAdmin: boolean; batchId: number }[]>([]);
    const fileRef = useRef<HTMLInputElement>(null);
    const { snackbar, showSuccess, showError, close } = useSnackbar();

    const parseCSV = (text: string) => {
        const lines = text.trim().split("\n").filter(l => l.trim());
        const parsed: { name: string; email: string; isAdmin: boolean; batchId: number }[] = [];
        for (const line of lines) {
            const parts = line.split(",").map(p => p.trim());
            if (parts.length < 3) continue;
            const [name, email, batchIdRaw, adminFlag] = parts;
            const batchId = Number(batchIdRaw);
            if (!name || !email || !Number.isInteger(batchId)) continue;
            parsed.push({ name, email, batchId, isAdmin: adminFlag?.toLowerCase() === "true" });
        }
        return parsed;
    };

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            const text = ev.target?.result as string;
            setPreview(parseCSV(text));
        };
        reader.readAsText(file);
    };

    const handleUpload = () => {
        if (preview.length === 0) return;
        startTransition(async () => {
            const res = await fetch("/api/users/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ users: preview }),
            });
            const data = await res.json();
            if (res.ok) {
                showSuccess(data.message);
                onAdded(data.users);
                setPreview([]);
                if (fileRef.current) fileRef.current.value = "";
            } else {
                showError(data.error || "Bulk upload failed");
            }
        });
    };

    return (
        <>
            <div className="bulk-upload">
                <h6 className="section-title">Bulk Upload via CSV</h6>
                <p className="csv-hint">CSV format: <code>name,email,batch_id,is_admin</code> (is_admin: true/false, optional)</p>
                <div className="bulk-actions">
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".csv,text/csv"
                        onChange={handleFile}
                        className="file-input"
                        disabled={isPending}
                    />
                    {preview.length > 0 && (
                        <button className="action-btn add-btn" onClick={handleUpload} disabled={isPending}>
                            {isPending ? "Uploading..." : `Upload ${preview.length} user(s)`}
                        </button>
                    )}
                </div>
                {preview.length > 0 && (
                    <div className="csv-preview">
                        <p className="preview-label">{preview.length} user(s) ready to import:</p>
                        {preview.slice(0, 5).map((u, i) => (
                            <div key={i} className="preview-row">
                                <span>{u.name}</span>
                                <span className="preview-email">{u.email}</span>
                                <span className="preview-batch">Batch {u.batchId}</span>
                                {u.isAdmin && <span className="role-badge role-admin">Admin</span>}
                            </div>
                        ))}
                        {preview.length > 5 && <p className="preview-more">+{preview.length - 5} more</p>}
                    </div>
                )}
            </div>
            <Snackbar isOpen={snackbar.isOpen} message={snackbar.message} type={snackbar.type} onClose={close} />
        </>
    );
};

const UserRow = ({
    user,
    onRoleToggled,
    onDeleted,
}: {
    user: User;
    onRoleToggled: (id: number, isAdmin: boolean) => void;
    onDeleted: (id: number) => void;
}) => {
    const [isPending, startTransition] = useTransition();
    const { snackbar, showSuccess, showError, close } = useSnackbar();

    const handleToggle = () => {
        startTransition(async () => {
            const res = await fetch(`/api/users/${user.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isAdmin: !user.isAdmin }),
            });
            const data = await res.json();
            if (res.ok) {
                onRoleToggled(user.id, !user.isAdmin);
                showSuccess(`Role updated to ${!user.isAdmin ? "Admin" : "User"}`);
            } else {
                showError(data.error || "Failed to update role");
            }
        });
    };

    const handleDelete = () => {
        if (!confirm(`Remove ${user.name} from the library?`)) return;
        startTransition(async () => {
            const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
            const data = await res.json();
            if (res.ok) {
                onDeleted(user.id);
            } else {
                showError(data.error || "Failed to delete user");
            }
        });
    };

    return (
        <>
            <div className="user-row">
                <div className="user-info">
                    <span className="user-name">{user.name}</span>
                    <span className="user-email">{user.email}</span>
                    <span className="user-batch">Batch {user.batchId}</span>
                </div>
                <div className="user-actions">
                    <RoleBadge isAdmin={user.isAdmin} />
                    <button
                        className="action-btn toggle-btn"
                        onClick={handleToggle}
                        disabled={isPending}
                    >
                        {isPending ? "..." : user.isAdmin ? "Make User" : "Make Admin"}
                    </button>
                    <button
                        className="action-btn delete-btn"
                        onClick={handleDelete}
                        disabled={isPending}
                    >
                        Remove
                    </button>
                </div>
            </div>
            <Snackbar isOpen={snackbar.isOpen} message={snackbar.message} type={snackbar.type} onClose={close} />
        </>
    );
};

export default function UsersManager({ initialUsers }: Props) {
    const [users, setUsers] = useState<User[]>(initialUsers);

    const handleAdded = (user: User) => {
        setUsers(prev => [user, ...prev]);
    };

    const handleBulkAdded = (newUsers: User[]) => {
        setUsers(prev => [...newUsers, ...prev]);
    };

    const handleRoleToggled = (id: number, isAdmin: boolean) => {
        setUsers(prev => prev.map(u => u.id === id ? { ...u, isAdmin } : u));
    };

    const handleDeleted = (id: number) => {
        setUsers(prev => prev.filter(u => u.id !== id));
    };

    return (
        <div className="users-manager">
            <AddUserForm onAdded={handleAdded} />
            <BulkUpload onAdded={handleBulkAdded} />

            <div className="users-list-section">
                <h6 className="section-title">All Users ({users.length})</h6>
                {users.length === 0 ? (
                    <p className="empty-state">No users found.</p>
                ) : (
                    <div className="users-list">
                        {users.map(user => (
                            <UserRow
                                key={user.id}
                                user={user}
                                onRoleToggled={handleRoleToggled}
                                onDeleted={handleDeleted}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
