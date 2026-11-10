import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/font/google", () => ({ Lexend: () => ({ className: "lx", variable: "--font-lexend" }) }));

import ManagePage from "../manage/page";
import OfflinePage from "../offline/page";
import BooksOfflinePage from "../books-offline/page";
import ManageOfflinePage from "../manage-offline/page";

describe("Manage hub", () => {
    it("lists the four admin tools with the right destinations", () => {
        render(<ManagePage />);
        expect(screen.getByRole("heading", { level: 1, name: "Manage" })).toBeInTheDocument();
        const links = screen.getAllByRole("link").map(a => [within(a).getByText(/./, { selector: ".mg-hub-t" }).textContent, a.getAttribute("href")]);
        expect(links).toEqual([
            ["Add book", "/manage/add-book"],
            ["Generate book QR codes", "/manage/generate-qr-code"],
            ["View borrowed books", "/manage/borrowed-books"],
            ["Manage users", "/manage/users"],
        ]);
    });
    it("describes each tool", () => {
        render(<ManagePage />);
        for (const link of screen.getAllByRole("link")) {
            expect(link.querySelector(".mg-hub-d")!.textContent!.length).toBeGreaterThan(10);
        }
    });
});

describe("offline pages", () => {
    const back = vi.fn();
    const reload = vi.fn();
    let hrefSet: string[];
    const originalLocation = window.location;

    beforeEach(() => {
        back.mockClear(); reload.mockClear(); hrefSet = [];
        vi.spyOn(window.history, "back").mockImplementation(back);
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { reload, set href(v: string) { hrefSet.push(v); } },
        });
    });
    afterEach(() => {
        Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
        vi.restoreAllMocks();
    });

    it("generic page: explains, goes back, retries", async () => {
        render(<OfflinePage />);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("You're Offline");
        await userEvent.click(screen.getByRole("button", { name: "Go Back" }));
        expect(back).toHaveBeenCalledTimes(1);
        await userEvent.click(screen.getByRole("button", { name: "Try Again" }));
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("books page: offers the reading list and going back", async () => {
        render(<BooksOfflinePage />);
        expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Go to Reading List" }));
        expect(hrefSet).toEqual(["/reading"]);
        await userEvent.click(screen.getByRole("button", { name: "Go Back" }));
        expect(back).toHaveBeenCalledTimes(1);
    });

    it("manage page: retries and goes home", async () => {
        render(<ManageOfflinePage />);
        expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Go to Home" }));
        expect(hrefSet).toEqual(["/"]);
        await userEvent.click(screen.getByRole("button", { name: "Try Reconnecting" }));
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
