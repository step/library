import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/font/google", () => ({
    Lexend: () => ({ className: "mock-lexend", variable: "--font-lexend" }),
}));

import TourVideo, { TOUR } from "../TourVideo";

describe("TourVideo", () => {
    it("shows only the button until it is pressed", () => {
        render(<TourVideo />);
        expect(screen.getByRole("button", { name: "Watch a 1-minute tour" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        // Nothing is fetched until someone asks for it.
        expect(document.querySelector("video")).toBeNull();
    });

    it("takes a custom label and class", () => {
        render(<TourVideo label="Watch how it works" className="bk-btn-outline" />);
        expect(screen.getByRole("button", { name: "Watch how it works" })).toHaveClass("bk-btn-outline");
    });

    it("opens a dialog with the video, its poster and English captions", async () => {
        render(<TourVideo />);
        await userEvent.click(screen.getByRole("button", { name: "Watch a 1-minute tour" }));

        const dialog = screen.getByRole("dialog", { name: "How the library works" });
        expect(dialog).toHaveAttribute("aria-modal", "true");
        const video = dialog.querySelector("video")!;
        expect(video).toHaveAttribute("controls");
        expect(video).toHaveAttribute("preload", "none");
        expect(video).toHaveAttribute("poster", TOUR.poster);
        expect(video.querySelector("source")).toHaveAttribute("src", TOUR.video);
        const track = video.querySelector("track")!;
        expect(track).toHaveAttribute("kind", "captions");
        expect(track).toHaveAttribute("src", TOUR.captions);
        expect(track).toHaveAttribute("srclang", "en");
    });

    it("keeps the files where the service worker will not precache them", () => {
        for (const path of Object.values(TOUR)) expect(path.startsWith("/onboarding/")).toBe(true);
    });

    it("closes with the close button", async () => {
        render(<TourVideo />);
        await userEvent.click(screen.getByRole("button", { name: "Watch a 1-minute tour" }));
        await userEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes with Escape and returns focus to the button", async () => {
        render(<TourVideo />);
        const open = screen.getByRole("button", { name: "Watch a 1-minute tour" });
        await userEvent.click(open);
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(open).toHaveFocus();
    });

    it("closes when the backdrop is clicked, but not when the dialog is", async () => {
        render(<TourVideo />);
        await userEvent.click(screen.getByRole("button", { name: "Watch a 1-minute tour" }));
        const dialog = screen.getByRole("dialog");
        await userEvent.click(dialog);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        await userEvent.click(dialog.parentElement!);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});
