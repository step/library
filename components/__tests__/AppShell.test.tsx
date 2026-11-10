import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ pathname: "/" }));
const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("next-auth/react", () => auth);
vi.mock("next/font/google", () => ({ Lexend: () => ({ className: "lx", variable: "--font-lexend" }) }));
vi.mock("../../src/app/BorrowBook", () => ({ default: () => <div data-testid="borrow-scanner" /> }));
vi.mock("../../src/app/reading/ReturnBook", () => ({ default: () => <div data-testid="return-scanner" /> }));

import AppShell from "../AppShell";

type TestUser = { name?: string | null; email?: string | null; isAdmin: boolean };
const member: TestUser = { name: "Mia Member", email: "mia@example.com", isAdmin: false };
const admin: TestUser = { name: "Ada Admin", email: "ada@example.com", isAdmin: true };

const renderAt = (path: string, user = member) => {
    nav.pathname = path;
    return render(<AppShell user={user}><p>page content</p></AppShell>);
};
const mainNav = () => screen.getAllByRole("navigation", { name: "Main" });
const linksIn = (el: HTMLElement) => within(el).getAllByRole("link").map(a => [a.textContent, a.getAttribute("href")]);

beforeEach(() => vi.clearAllMocks());

describe("AppShell navigation", () => {
    it("shows Books, Reading and Past reads to a member, in both the sidebar and the bottom bar", () => {
        renderAt("/");
        const expected = [["Books", "/"], ["Reading", "/reading"], ["Past reads", "/history"]];
        expect(mainNav()).toHaveLength(2);
        for (const n of mainNav()) expect(linksIn(n)).toEqual(expected);
    });

    it("never shows Manage to a member", () => {
        renderAt("/");
        expect(screen.queryByRole("link", { name: "Manage" })).not.toBeInTheDocument();
    });

    it("shows Manage to an admin, last, in both bars", () => {
        renderAt("/", admin);
        for (const n of mainNav()) expect(linksIn(n).at(-1)).toEqual(["Manage", "/manage"]);
    });

    it("does not offer a Request link", () => {
        renderAt("/", admin);
        expect(screen.queryByRole("link", { name: /request/i })).not.toBeInTheDocument();
    });

    it.each([
        ["/", "Books"],
        ["/reading", "Reading"],
        ["/reading/anything", "Reading"],
        ["/history", "Past reads"],
        ["/history/2026", "Past reads"],
        ["/manage", "Manage"],
        ["/manage/users", "Manage"],
        ["/manage/add-book", "Manage"],
    ])("on %s the active item is %s (in both bars)", (path, label) => {
        renderAt(path, admin);
        for (const n of mainNav()) {
            const current = within(n).getAllByRole("link").filter(a => a.getAttribute("aria-current") === "page");
            expect(current.map(a => a.textContent)).toEqual([label]);
        }
    });

    it("marks the active link with the highlight class, and only that one", () => {
        renderAt("/reading");
        const nav = mainNav()[0];
        expect(within(nav).getByRole("link", { name: "Reading" })).toHaveClass("is-active");
        expect(within(nav).getByRole("link", { name: "Books" })).not.toHaveClass("is-active");
        const bottom = mainNav()[1];
        expect(within(bottom).getByRole("link", { name: "Reading" })).toHaveClass("is-active");
    });

    it("Books is not highlighted on another page just because it links to '/'", () => {
        renderAt("/reading");
        const books = within(mainNav()[0]).getByRole("link", { name: "Books" });
        expect(books).not.toHaveAttribute("aria-current");
    });

    it("highlights nothing on an unknown page", () => {
        renderAt("/somewhere-else");
        expect(document.querySelector("[aria-current]")).toBeNull();
    });
});

describe("AppShell scanner", () => {
    it.each(["/", "/history", "/something"])("offers borrowing on %s", (path) => {
        renderAt(path);
        expect(screen.getByTestId("borrow-scanner")).toBeInTheDocument();
        expect(screen.queryByTestId("return-scanner")).not.toBeInTheDocument();
    });
    it.each(["/reading", "/reading/x"])("offers returning on %s", (path) => {
        renderAt(path);
        expect(screen.getByTestId("return-scanner")).toBeInTheDocument();
        expect(screen.queryByTestId("borrow-scanner")).not.toBeInTheDocument();
    });
    it.each(["/manage", "/manage/users"])("offers no scanner on %s", (path) => {
        renderAt(path, admin);
        expect(screen.queryByTestId("borrow-scanner")).not.toBeInTheDocument();
        expect(screen.queryByTestId("return-scanner")).not.toBeInTheDocument();
    });
});

describe("AppShell user area", () => {
    it("renders the page inside <main>", () => {
        renderAt("/");
        expect(within(screen.getByRole("main")).getByText("page content")).toBeInTheDocument();
    });

    it("shows the user's name and email", () => {
        renderAt("/");
        expect(screen.getByText("Mia Member")).toBeInTheDocument();
        expect(screen.getByText("mia@example.com")).toBeInTheDocument();
    });

    it.each([
        [{ name: "Ada Lovelace", email: "ada@x.com" }, "AL"],
        [{ name: "Cher", email: "cher@x.com" }, "C"],
        [{ name: "  mia   member ", email: "m@x.com" }, "MM"],
        [{ name: "", email: "first.last@x.com" }, "FL"],
        [{ name: null, email: "solo@x.com" }, "SX"],
        [{ name: null, email: null }, "?"],
        [{ name: "@@", email: "x@x.com" }, "?"],
        [{ name: "Zoë Müller", email: "z@x.com" }, "ZM"],
    ])("initials for %j are %s", (user, initials) => {
        renderAt("/", { ...user, isAdmin: false });
        expect(screen.getAllByText(initials, { selector: ".sh-avatar" }).length).toBeGreaterThan(0);
    });

    it("both sign-out buttons sign out", async () => {
        renderAt("/");
        const buttons = screen.getAllByRole("button", { name: "Sign out" });
        expect(buttons.length).toBe(2);
        auth.signOut.mockClear();
        for (const b of buttons) await userEvent.click(b);
        expect(auth.signOut).toHaveBeenCalledTimes(2);
    });
});
