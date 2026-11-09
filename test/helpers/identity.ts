export type Identity = "anonymous" | "member" | "admin";

export const MEMBER = { id: 11, name: "Mia Member", email: "mia@example.com", isAdmin: false, batchId: 1 };
export const ADMIN = { id: 1, name: "Ada Admin", email: "ada@example.com", isAdmin: true, batchId: 1 };

export const libraryUserFor = (who: Identity) =>
    who === "admin" ? ADMIN : who === "member" ? MEMBER : null;

/** The shape NextAuth's getServerSession returns (note: no numeric id, see the session callback). */
export const sessionFor = (who: Identity) => {
    const u = libraryUserFor(who);
    return u ? { user: { name: u.name, email: u.email, isAdmin: u.isAdmin } } : null;
};
