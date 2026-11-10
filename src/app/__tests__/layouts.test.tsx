// @vitest-environment node
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ getServerSession: vi.fn(), getLoggedInUser: vi.fn(), getAllLibraryUsers: vi.fn() }));

vi.mock("next-auth", () => ({ getServerSession: m.getServerSession }));
vi.mock("@/app/lib/auth", () => ({ authOptions: {} }));
vi.mock("next/font/google", () => ({ Lexend: () => ({ className: "lx", variable: "--font-lexend" }) }));
vi.mock("next/navigation", () => ({
    redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); },
}));
vi.mock("../../../db/user", () => ({ getLoggedInUser: m.getLoggedInUser, getAllLibraryUsers: m.getAllLibraryUsers }));
vi.mock("../../../components/Login", () => ({ default: function Login() { return null; } }));
vi.mock("../../../components/AppShell", () => ({ default: function AppShell() { return null; } }));
vi.mock("../SessionProviderWrapper", () => ({ default: function SessionProviderWrapper() { return null; } }));
vi.mock("../manage/users/UsersManager", () => ({ default: function UsersManager() { return null; } }));
vi.mock("@/components/manage/BackLink", () => ({ default: function BackLink() { return null; } }));

import RootLayout from "../layout";
import ManagementLayout from "../manage/layout";
import UsersPage from "../manage/users/page";
import { requireAdminPage } from "../lib/admin";
import Login from "../../../components/Login";
import AppShell from "../../../components/AppShell";

type El = React.ReactElement<{ children?: React.ReactNode; className?: string; user?: unknown }>;

/** The element rendered inside <body>. */
const bodyContent = async (session: unknown) => {
    m.getServerSession.mockResolvedValue(session);
    const html = (await RootLayout({ children: React.createElement("p", null, "page") })) as El;
    const body = html.props.children as El;
    return body.props.children as El;
};

const as = (who: "anonymous" | "member" | "admin") => {
    const user = who === "anonymous" ? null : { id: 1, email: "x@x.com", isAdmin: who === "admin" };
    m.getLoggedInUser.mockResolvedValue(user);
    m.getServerSession.mockResolvedValue(user ? { user: { email: user.email, isAdmin: user.isAdmin } } : null);
};

beforeEach(() => vi.clearAllMocks());

describe("RootLayout", () => {
    it("shows the sign-in screen, and none of the app, without a session", async () => {
        const content = await bodyContent(null);
        expect(content.type).toBe(Login);
    });

    it("shows the app shell for a signed-in user, with the page inside", async () => {
        const content = await bodyContent({ user: { name: "Mia", email: "mia@x.com", isAdmin: false } });
        const shell = content.props.children as El;
        expect(shell.type).toBe(AppShell);
        expect(shell.props.user).toEqual({ name: "Mia", email: "mia@x.com", isAdmin: false });
    });

    it.each([[undefined, false], [null, false], [false, false], [true, true], [1, true]])("passes isAdmin=%j to the shell as %j", async (flag, expected) => {
        const content = await bodyContent({ user: { name: "M", email: "m@x.com", isAdmin: flag } });
        expect((content.props.children as El).props.user).toMatchObject({ isAdmin: expected });
    });

    it("copes with a session that has no user object", async () => {
        const content = await bodyContent({});
        const shell = content.props.children as El;
        expect(shell.type).toBe(AppShell);
        expect(shell.props.user).toEqual({ name: undefined, email: undefined, isAdmin: false });
    });

    it("sets the page language and the font classes", async () => {
        m.getServerSession.mockResolvedValue(null);
        const html = (await RootLayout({ children: null })) as El & { props: { lang: string } };
        expect(html.props.lang).toBe("en");
        expect(((html.props.children as El).props.className)).toContain("lx");
    });
});

describe("ManagementLayout (/manage)", () => {
    const render = (who: "anonymous" | "member" | "admin") => { as(who); return ManagementLayout({ children: React.createElement("p") }); };

    it("sends a signed-out visitor to the login page", async () => {
        await expect(render("anonymous")).rejects.toThrow("NEXT_REDIRECT /login");
    });
    it("sends a member home", async () => {
        await expect(render("member")).rejects.toThrow("NEXT_REDIRECT /");
    });
    it("lets an admin in and keeps the page content", async () => {
        const el = (await render("admin")) as El;
        expect(el.props.className).toMatch(/mg-page/);
        expect((el.props.children as El).type).toBe("p");
    });
    it("treats a session without a user as signed out", async () => {
        m.getServerSession.mockResolvedValue({});
        await expect(ManagementLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT /login");
    });
});

describe("requireAdminPage (each admin page checks for itself)", () => {
    it("redirects a signed-out visitor to /login", async () => {
        as("anonymous");
        await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT /login");
    });
    it("redirects a member to /", async () => {
        as("member");
        await expect(requireAdminPage()).rejects.toThrow("NEXT_REDIRECT /");
    });
    it("returns the admin", async () => {
        as("admin");
        await expect(requireAdminPage()).resolves.toMatchObject({ isAdmin: true });
    });
});

describe("/manage/users page", () => {
    it("never loads the user list for a member or a signed-out visitor (regression: it had no check of its own)", async () => {
        for (const who of ["anonymous", "member"] as const) {
            as(who);
            await expect(UsersPage()).rejects.toThrow("NEXT_REDIRECT");
        }
        expect(m.getAllLibraryUsers).not.toHaveBeenCalled();
    });

    it("loads the list for an admin and passes it on", async () => {
        as("admin");
        m.getAllLibraryUsers.mockResolvedValue([{ id: 1 }]);
        const page = (await UsersPage()) as El;
        const manager = (page.props.children as El[]).find(c => c && typeof c.type === "function" && (c.type as { name: string }).name === "UsersManager") as El & { props: { initialUsers: unknown } };
        expect(manager.props.initialUsers).toEqual([{ id: 1 }]);
    });
});
