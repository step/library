import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Our own mocks: nothing here reaches Google, NextAuth's backend or the network.
const signInMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
    signIn: signInMock,
}));

vi.mock("next/font/google", () => ({
    Lexend: () => ({ className: "mock-lexend", variable: "--font-lexend" }),
}));

import Login from "../Login";
import LoginPage from "../../src/app/login/page";

describe("Login", () => {
    beforeEach(() => {
        signInMock.mockReset();
        signInMock.mockResolvedValue(undefined);
    });

    it("shows the sign-in heading and explanation", () => {
        render(<Login />);
        expect(screen.getByRole("heading", { level: 1, name: "Sign in to Library" })).toBeInTheDocument();
        expect(screen.getByText(/Use your Google account to borrow and return books/)).toBeInTheDocument();
        expect(screen.getByText(/We only use your Google account to identify you/)).toBeInTheDocument();
    });

    it("lists the three features in the aside", () => {
        render(<Login />);
        expect(screen.getByRole("heading", { level: 2, name: "Borrow and return books in seconds" })).toBeInTheDocument();
        for (const title of ["Scan to borrow or return", "See what you have out", "Look back at past reads"]) {
            expect(screen.getByText(title)).toBeInTheDocument();
        }
        expect(screen.getAllByRole("listitem")).toHaveLength(3);
    });

    it("renders the illustration with an accessible label", () => {
        render(<Login />);
        const illustrations = screen.getAllByRole("img", { name: /girl sitting cross-legged/ });
        expect(illustrations).toHaveLength(2);
    });

    it("offers the walkthrough video before signing in", () => {
        render(<Login />);
        expect(screen.getByRole("button", { name: "Watch a 1-minute tour" })).toBeInTheDocument();
    });

    it("applies the font class to the page", () => {
        const { container } = render(<Login />);
        expect(container.firstChild).toHaveClass("lb-signin", "mock-lexend");
    });

    it("does not call signIn until the button is used", () => {
        render(<Login />);
        expect(signInMock).not.toHaveBeenCalled();
    });

    it("starts the Google sign-in when the button is clicked", async () => {
        const user = userEvent.setup();
        render(<Login />);
        await user.click(screen.getByRole("button", { name: "Continue with Google" }));
        expect(signInMock).toHaveBeenCalledTimes(1);
        expect(signInMock).toHaveBeenCalledWith("google");
    });

    it("can be activated from the keyboard", async () => {
        const user = userEvent.setup();
        render(<Login />);
        await user.tab();
        const button = screen.getByRole("button", { name: "Continue with Google" });
        expect(button).toHaveFocus();
        await user.keyboard("{Enter}");
        expect(signInMock).toHaveBeenCalledWith("google");
    });

    it("hides the decorative Google logo from assistive tech", () => {
        render(<Login />);
        const button = screen.getByRole("button", { name: "Continue with Google" });
        expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });

    it("has a single way to sign in: the only other button plays the tour", async () => {
        const user = userEvent.setup();
        render(<Login />);
        const buttons = screen.getAllByRole("button");
        expect(buttons.map(b => b.textContent)).toEqual(["Continue with Google", "Watch a 1-minute tour"]);
        await user.click(buttons[1]);
        expect(signInMock).not.toHaveBeenCalled();
    });
});

describe("/login page", () => {
    it("renders the Login component", () => {
        render(<LoginPage />);
        expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    });
});
