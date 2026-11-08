"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { BookOpenText, History, Library, ListChecks, LogOut } from "lucide-react";
import { lexend } from "../src/app/lib/fonts";
import BorrowBook from "../src/app/BorrowBook";
import ReturnBook from "../src/app/reading/ReturnBook";
import "../styles/AppShell.css";

type ShellUser = {
    name?: string | null;
    email?: string | null;
    isAdmin: boolean;
};

type NavItem = { label: string; href: string; icon: React.ReactNode; match: (path: string) => boolean };

const buildNav = (isAdmin: boolean): NavItem[] => {
    const items: NavItem[] = [
        { label: "Books", href: "/", icon: <Library size={20} aria-hidden="true" />, match: (p) => p === "/" },
        { label: "Reading", href: "/reading", icon: <BookOpenText size={20} aria-hidden="true" />, match: (p) => p.startsWith("/reading") },
        { label: "Past reads", href: "/history", icon: <History size={20} aria-hidden="true" />, match: (p) => p.startsWith("/history") },
    ];
    if (isAdmin) {
        items.push({ label: "Manage", href: "/manage", icon: <ListChecks size={20} aria-hidden="true" />, match: (p) => p.startsWith("/manage") });
    }
    return items;
};

const initials = (user: ShellUser) => {
    const source = (user.name || user.email || "?").trim();
    const parts = source.split(/[\s@.]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[1][0] : "")).toUpperCase();
};

const BrandMark = () => (
    <span className="sh-mark">
        <Library size={20} aria-hidden="true" />
    </span>
);

const AppShell = ({ user, children }: { user: ShellUser; children: React.ReactNode }) => {
    const pathname = usePathname();
    const nav = buildNav(user.isAdmin);
    // Scanning borrows from the catalogue and returns from the Reading page. Not offered on admin pages.
    const scanner = pathname.startsWith("/manage") ? null : pathname.startsWith("/reading") ? <ReturnBook /> : <BorrowBook />;

    return (
        <div className={`sh-app ${lexend.className}`}>
            <aside className="sh-side">
                <div>
                    <div className="sh-brand">
                        <BrandMark />
                        <span>Library</span>
                    </div>
                    <nav className="sh-side-nav" aria-label="Main">
                        {nav.map((item) => {
                            const active = item.match(pathname);
                            return (
                                <Link key={item.href} href={item.href} className={`sh-nav ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
                                    {item.icon}
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>
                </div>
                <div className="sh-user">
                    <div className="sh-user-row">
                        <span className="sh-avatar" aria-hidden="true">{initials(user)}</span>
                        <span className="sh-user-text">
                            <span className="sh-user-name">{user.name}</span>
                            <span className="sh-user-mail">{user.email}</span>
                        </span>
                    </div>
                    <button className="sh-signout" onClick={() => signOut()}>
                        <LogOut size={18} aria-hidden="true" />
                        <span>Sign out</span>
                    </button>
                </div>
            </aside>

            <div className="sh-main">
                <header className="sh-top">
                    <div className="sh-brand">
                        <BrandMark />
                        <span>Library</span>
                    </div>
                    <button className="sh-avatar-btn" aria-label="Sign out" onClick={() => signOut()}>
                        <span className="sh-avatar" aria-hidden="true">{initials(user)}</span>
                    </button>
                </header>
                <main className="sh-content">{children}</main>
            </div>

            <nav className="sh-bottom" aria-label="Main">
                {nav.map((item) => {
                    const active = item.match(pathname);
                    return (
                        <Link key={item.href} href={item.href} className={`sh-tab ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
                            <span className="sh-tab-pill">{item.icon}</span>
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            {scanner}
        </div>
    );
};

export default AppShell;
