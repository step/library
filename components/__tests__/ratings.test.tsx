import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

vi.mock("next/font/google", () => ({ Lexend: () => ({ className: "lx", variable: "--font-lexend" }) }));
const api = vi.hoisted(() => ({ saveRating: vi.fn(), removeRating: vi.fn() }));
vi.mock("../../src/app/BooksApi", () => api);

import BookRow from "../BookRow";
import PastReads from "../PastReads";
import StarInput from "../ratings/StarInput";
import Stars from "../ratings/Stars";
import RateAfterReturn from "../ratings/RateAfterReturn";
import type { Book } from "../../types/Book";
import type { ReturnedBook } from "../../types/BorrowedBook";

beforeEach(() => {
    vi.clearAllMocks();
    api.saveRating.mockResolvedValue({ success: true });
    api.removeRating.mockResolvedValue({ success: true });
});

const book = (over: Partial<Book> = {}): Book => ({
    id: 1, title: "Dune", authors: "Frank Herbert", count: 3, borrowedCount: 1, ratingCount: 0, ratingAverage: null, ...over,
});

describe("BookRow: average rating", () => {
    it("shows the average to one decimal and the number of readers, read as one sentence", () => {
        const { container } = render(<BookRow book={book({ ratingCount: 18, ratingAverage: 4.6 })} />);
        const visible = container.querySelector(".bk-avg")!;
        expect(visible).toHaveAttribute("aria-hidden", "true");
        expect(visible).toHaveTextContent("4.6(18)");
        expect(screen.getByText("Rated 4.6 out of 5 by 18 readers")).toHaveClass("bk-sr");
    });

    it("keeps one decimal for whole numbers and says '1 reader'", () => {
        render(<BookRow book={book({ ratingCount: 1, ratingAverage: 4 })} />);
        expect(screen.getByText("4.0")).toBeInTheDocument();
        expect(screen.getByText("Rated 4.0 out of 5 by 1 reader")).toBeInTheDocument();
    });

    it("says 'No ratings' when nobody has rated the book", () => {
        render(<BookRow book={book()} />);
        expect(screen.getByText("No ratings")).toBeInTheDocument();
        expect(screen.getByText("No ratings yet")).toHaveClass("bk-sr");
    });

    it("shows nothing for a book from an older cached list without ratings", () => {
        const old = { ...book(), ratingCount: undefined, ratingAverage: undefined } as unknown as Book;
        const { container } = render(<BookRow book={old} />);
        expect(container.querySelector(".bk-avg")).toBeNull();
        expect(screen.queryByText(/ratings/i)).not.toBeInTheDocument();
    });

    it("keeps the author beside the rating", () => {
        const { container } = render(<BookRow book={book({ ratingCount: 2, ratingAverage: 3.5 })} />);
        const line = container.querySelector(".bk-sline")!;
        expect(within(line as HTMLElement).getByText("Frank Herbert")).toBeInTheDocument();
        expect(line).toHaveTextContent("3.5");
    });
});

describe("Stars (read only)", () => {
    it("is one image announced as 'Rated N out of 5' with N stars filled", () => {
        const { container } = render(<Stars value={3} />);
        expect(screen.getByRole("img", { name: "Rated 3 out of 5" })).toBeInTheDocument();
        expect(container.querySelectorAll(".rt-star.is-on")).toHaveLength(3);
        expect(container.querySelectorAll(".rt-star")).toHaveLength(5);
    });
});

describe("StarInput", () => {
    const Harness = ({ start = 0, onChange = vi.fn() }: { start?: number; onChange?: (n: number) => void }) => {
        const [v, setV] = useState(start);
        return (
            <>
                <span id="lbl">How was it?</span>
                <StarInput value={v} onChange={n => { setV(n); onChange(n); }} labelledBy="lbl" />
            </>
        );
    };
    const checked = () => screen.getAllByRole("radio").findIndex(r => r.getAttribute("aria-checked") === "true") + 1;

    it("is a radio group of five stars, named by its label", () => {
        render(<Harness />);
        const group = screen.getByRole("radiogroup", { name: "How was it?" });
        expect(within(group).getAllByRole("radio").map(r => r.getAttribute("aria-label")))
            .toEqual(["1 star", "2 stars", "3 stars", "4 stars", "5 stars"]);
        expect(checked()).toBe(0);
    });

    it("clicking a star picks it and fills the stars up to it", async () => {
        const onChange = vi.fn();
        const { container } = render(<Harness onChange={onChange} />);
        await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
        expect(onChange).toHaveBeenCalledWith(4);
        expect(checked()).toBe(4);
        expect(container.querySelectorAll(".rt-star.is-on")).toHaveLength(4);
    });

    it("only one star is in the tab order: the chosen one, or the first", async () => {
        const { rerender } = render(<Harness />);
        expect(screen.getAllByRole("radio").map(r => r.tabIndex)).toEqual([0, -1, -1, -1, -1]);
        rerender(<Harness start={3} />);
        await userEvent.click(screen.getByRole("radio", { name: "3 stars" }));
        expect(screen.getAllByRole("radio").map(r => r.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
    });

    it("arrow keys move the choice and focus, wrapping at the ends; Home and End jump", async () => {
        render(<Harness start={1} />);
        await userEvent.tab();
        expect(screen.getByRole("radio", { name: "1 star" })).toHaveFocus();
        await userEvent.keyboard("{ArrowRight}{ArrowRight}");
        expect(checked()).toBe(3);
        expect(screen.getByRole("radio", { name: "3 stars" })).toHaveFocus();
        await userEvent.keyboard("{ArrowLeft}");
        expect(checked()).toBe(2);
        await userEvent.keyboard("{End}");
        expect(checked()).toBe(5);
        await userEvent.keyboard("{ArrowRight}");
        expect(checked()).toBe(1);
        await userEvent.keyboard("{ArrowLeft}");
        expect(checked()).toBe(5);
        await userEvent.keyboard("{Home}");
        expect(checked()).toBe(1);
    });
});

describe("RateAfterReturn", () => {
    const returned = { id: 7, title: "Designing Data-Intensive Applications", authors: "Martin Kleppmann", myRating: null };
    const setup = (over = {}) => {
        const onDone = vi.fn();
        render(<RateAfterReturn book={{ ...returned, ...over }} onDone={onDone} />);
        return { onDone };
    };
    const saveBtn = () => screen.getByRole("button", { name: /Save rating|Try again/ });

    it("confirms the return and offers an optional rating", () => {
        setup();
        const dialog = screen.getByRole("dialog", { name: "Book returned" });
        expect(dialog).toHaveFocus();
        expect(within(dialog).getByText("Designing Data-Intensive Applications")).toBeInTheDocument();
        expect(within(dialog).getByText("Martin Kleppmann")).toBeInTheDocument();
        expect(screen.getByText("Optional")).toBeInTheDocument();
        expect(screen.getByRole("radiogroup", { name: "How was it?" })).toBeInTheDocument();
        expect(screen.getByText("Tap a star to rate, or skip")).toHaveAttribute("aria-live", "polite");
        expect(saveBtn()).toBeDisabled();
        expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
    });

    it("starts with the reader's earlier rating of the book", () => {
        setup({ myRating: 3 });
        expect(screen.getByRole("radio", { name: "3 stars" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByText("Good")).toBeInTheDocument();
        expect(saveBtn()).toBeEnabled();
    });

    it("picking a star shows its label; Clear undoes the choice without saving", async () => {
        setup();
        await userEvent.click(screen.getByRole("radio", { name: "5 stars" }));
        expect(screen.getByText("Loved it")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(screen.getByText("Tap a star to rate, or skip")).toBeInTheDocument();
        expect(saveBtn()).toBeDisabled();
        expect(api.saveRating).not.toHaveBeenCalled();
    });

    it("saves the rating for the returned book and finishes as rated", async () => {
        const { onDone } = setup();
        await userEvent.click(screen.getByRole("radio", { name: "4 stars" }));
        await userEvent.click(saveBtn());
        expect(api.saveRating).toHaveBeenCalledWith(7, 4);
        expect(onDone).toHaveBeenCalledWith("rated");
    });

    it.each([
        ["server", "Could not save your rating", "Something went wrong on our side. Your book is still marked as returned."],
        ["offline", "You are offline", "Check your connection, then try again. Your book is still marked as returned."],
    ])("a %s failure keeps the stars, explains, and offers Try again", async (reason, title, detail) => {
        api.saveRating.mockResolvedValueOnce({ success: false, reason });
        const { onDone } = setup();
        await userEvent.click(screen.getByRole("radio", { name: "2 stars" }));
        await userEvent.click(saveBtn());
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(title);
        expect(alert).toHaveTextContent(detail);
        expect(screen.getByRole("radio", { name: "2 stars" })).toHaveAttribute("aria-checked", "true");
        expect(onDone).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(api.saveRating).toHaveBeenCalledTimes(2);
        expect(onDone).toHaveBeenCalledWith("rated");
    });

    it.each([
        ["Skip for now", async () => userEvent.click(screen.getByRole("button", { name: "Skip for now" }))],
        ["the close button", async () => userEvent.click(screen.getByRole("button", { name: "Close" }))],
        ["Escape", async () => userEvent.keyboard("{Escape}")],
    ])("%s finishes as skipped without saving", async (_n, act) => {
        const { onDone } = setup({ myRating: 4 });
        await act();
        expect(onDone).toHaveBeenCalledWith("skipped");
        expect(api.saveRating).not.toHaveBeenCalled();
    });

    it("cannot be skipped or saved twice while a save is running", async () => {
        let finish!: (v: unknown) => void;
        api.saveRating.mockReturnValue(new Promise(r => { finish = r; }));
        const { onDone } = setup({ myRating: 4 });
        await userEvent.click(saveBtn());
        expect(screen.getByRole("button", { name: "Skip for now" })).toBeDisabled();
        expect(saveBtn()).toBeDisabled();
        await userEvent.keyboard("{Escape}");
        expect(onDone).not.toHaveBeenCalled();
        finish({ success: true });
        await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith("rated"));
    });
});

describe("PastReads: ratings", () => {
    const past = (id: number, over: Partial<ReturnedBook> = {}): ReturnedBook => ({
        id, bookId: id, title: `Book ${id}`, authors: "A",
        borrowedDate: "2026-01-01T12:00:00Z", returnedDate: "2026-01-15T12:00:00Z", rating: null, ...over,
    });
    const row = (i = 0) => screen.getAllByRole("listitem")[i];

    it("an unrated book says so and offers to rate it", () => {
        render(<PastReads books={[past(1)]} />);
        expect(within(row()).getByText("Not rated yet")).toBeInTheDocument();
        const btn = within(row()).getByRole("button", { name: "Rate Book 1" });
        expect(btn).toHaveTextContent("Rate this book");
    });

    it("a rated book shows its stars and label and offers to edit", () => {
        render(<PastReads books={[past(1, { rating: 5 })]} />);
        expect(within(row()).getByRole("img", { name: "Rated 5 out of 5" })).toBeInTheDocument();
        expect(within(row()).getByText("Loved it")).toBeInTheDocument();
        expect(within(row()).getByRole("button", { name: "Edit your rating for Book 1" })).toHaveTextContent("Edit rating");
    });

    it("has a 'Your rating' column heading for wide screens", () => {
        const { container } = render(<PastReads books={[past(1)]} />);
        expect(container.querySelector(".bk-th-rate")).toHaveTextContent("Your rating");
    });

    it("rating a book: dialog, save, toast, and every loan of that book updates", async () => {
        render(<PastReads books={[past(1), past(2, { bookId: 1, title: "Book 1" }), past(3)]} />);
        await userEvent.click(within(row(0)).getByRole("button", { name: "Rate Book 1" }));
        const dialog = screen.getByRole("dialog", { name: "Book 1" });
        expect(within(dialog).getByText("Rate this book")).toBeInTheDocument();
        expect(within(dialog).getByText("Tap a star to choose your rating")).toBeInTheDocument();
        expect(within(dialog).queryByRole("button", { name: "Remove my rating" })).not.toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Save rating" })).toBeDisabled();

        await userEvent.click(within(dialog).getByRole("radio", { name: "4 stars" }));
        expect(within(dialog).getByText("Really good")).toBeInTheDocument();
        await userEvent.click(within(dialog).getByRole("button", { name: "Save rating" }));

        expect(api.saveRating).toHaveBeenCalledWith(1, 4);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Thanks, your rating is saved");
        expect(within(row(0)).getByRole("img", { name: "Rated 4 out of 5" })).toBeInTheDocument();
        expect(within(row(1)).getByRole("img", { name: "Rated 4 out of 5" })).toBeInTheDocument();
        expect(within(row(2)).getByText("Not rated yet")).toBeInTheDocument();
    });

    it("editing starts from the current rating and can remove it", async () => {
        render(<PastReads books={[past(1, { rating: 5 })]} />);
        await userEvent.click(screen.getByRole("button", { name: "Edit your rating for Book 1" }));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByText("Edit your rating")).toBeInTheDocument();
        expect(within(dialog).getByRole("radio", { name: "5 stars" })).toHaveAttribute("aria-checked", "true");
        await userEvent.click(within(dialog).getByRole("button", { name: "Remove my rating" }));
        expect(api.removeRating).toHaveBeenCalledWith(1);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Rating removed");
        expect(within(row()).getByText("Not rated yet")).toBeInTheDocument();
    });

    it("a failed remove closes the dialog, keeps the rating and shows an error toast", async () => {
        api.removeRating.mockResolvedValueOnce({ success: false, reason: "server" });
        render(<PastReads books={[past(1, { rating: 3 })]} />);
        await userEvent.click(screen.getByRole("button", { name: "Edit your rating for Book 1" }));
        await userEvent.click(screen.getByRole("button", { name: "Remove my rating" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("Could not remove your rating. Try again.");
        expect(within(row()).getByRole("img", { name: "Rated 3 out of 5" })).toBeInTheDocument();
    });

    it.each([
        ["server", "Something went wrong on our side. Your stars are still selected, so you can try again."],
        ["offline", "Check your connection, then try again. Your stars are still selected."],
    ])("a %s save failure stays in the dialog with an explanation and Try again", async (reason, detail) => {
        api.saveRating.mockResolvedValueOnce({ success: false, reason });
        render(<PastReads books={[past(1)]} />);
        await userEvent.click(screen.getByRole("button", { name: "Rate Book 1" }));
        await userEvent.click(screen.getByRole("radio", { name: "2 stars" }));
        await userEvent.click(screen.getByRole("button", { name: "Save rating" }));
        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByRole("alert")).toHaveTextContent(detail);
        expect(within(dialog).getByRole("radio", { name: "2 stars" })).toHaveAttribute("aria-checked", "true");
        await userEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(within(row()).getByRole("img", { name: "Rated 2 out of 5" })).toBeInTheDocument();
    });

    it("Cancel and Escape close without saving, and focus returns to the row's button", async () => {
        render(<PastReads books={[past(1)]} />);
        const btn = screen.getByRole("button", { name: "Rate Book 1" });
        await userEvent.click(btn);
        await userEvent.click(screen.getByRole("radio", { name: "3 stars" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(btn).toHaveFocus();
        await userEvent.click(btn);
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(api.saveRating).not.toHaveBeenCalled();
        expect(within(row()).getByText("Not rated yet")).toBeInTheDocument();
    });

    it("keeps Tab inside the dialog", async () => {
        render(<PastReads books={[past(1, { rating: 2 })]} />);
        await userEvent.click(screen.getByRole("button", { name: "Edit your rating for Book 1" }));
        const dialog = screen.getByRole("dialog");
        for (let i = 0; i < 6; i++) {
            await userEvent.tab();
            expect(dialog.contains(document.activeElement)).toBe(true);
        }
    });

    it.each([
        ["rated", "Thanks, your rating is saved"],
        ["returned", "Book returned"],
    ] as const)("on arrival with ?toast=%s shows '%s' and drops the parameter", (toast, text) => {
        const replace = vi.spyOn(window.history, "replaceState");
        render(<PastReads books={[past(1)]} toast={toast} />);
        expect(screen.getByRole("status")).toHaveTextContent(text);
        expect(replace.mock.calls[0].slice(1)).toEqual(["", window.location.pathname]);
        replace.mockRestore();
    });
});
