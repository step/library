import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("next/font/google", () => ({ Lexend: () => ({ className: "lx", variable: "--font-lexend" }) }));
vi.mock("next/image", () => ({
    // Next's Image takes props a plain <img> must not receive.
    // eslint-disable-next-line @next/next/no-img-element, @typescript-eslint/no-explicit-any
    default: (props: any) => <img src={props.src} width={props.width} height={props.height} alt={props.alt} />,
}));

import BookRow from "../BookRow";
import BookRowSkeleton from "../BookRowSkeleton";
import BookListSkeleton from "../BookListSkeleton";
import { LoadingFooter } from "../LoadingFooter";
import ReadingBooks from "../ReadingBooks";
import PastReads from "../PastReads";
import LoadingView from "../../src/app/loading";
import BookCover from "../BookCover";
import IconButton from "../IconButton";
import PrimaryButton from "../PrimaryButton";
import StepIcon from "../StepIcon";
import BackLink from "../manage/BackLink";
import type { Book } from "../../types/Book";

const book = (over: Partial<Book> = {}): Book => ({ id: 1, title: "Dune", authors: "Frank Herbert", isbn10: "", isbn13: "", count: 3, borrowedCount: 1, ...over });

describe("BookRow", () => {
    const stats = () => {
        const get = (label: string) => screen.getByText(label).parentElement!.querySelector(".bk-num")!.textContent;
        return { total: get("Total"), borrowed: get("Borrowed"), available: get("Available") };
    };

    it("shows title, authors and the three numbers", () => {
        render(<BookRow book={book()} />);
        expect(screen.getByText("Dune")).toBeInTheDocument();
        expect(screen.getByText("Frank Herbert")).toBeInTheDocument();
        expect(stats()).toEqual({ total: "3", borrowed: "1", available: "2" });
    });

    it("available is total minus borrowed", () => {
        render(<BookRow book={book({ count: 10, borrowedCount: 7 })} />);
        expect(stats().available).toBe("3");
    });

    it("flags a title with nothing left, in red, with a tag", () => {
        render(<BookRow book={book({ count: 2, borrowedCount: 2 })} />);
        expect(screen.getByText("None left")).toBeInTheDocument();
        expect(stats().available).toBe("0");
        expect(screen.getByText("0")).toHaveClass("bk-out");
    });

    it("does not flag a title with copies free", () => {
        render(<BookRow book={book()} />);
        expect(screen.queryByText("None left")).not.toBeInTheDocument();
        expect(screen.getByText("2", { selector: ".bk-num" })).toHaveClass("bk-ok");
    });

    it("treats a title with no copies at all as none left", () => {
        render(<BookRow book={book({ count: 0, borrowedCount: 0 })} />);
        expect(screen.getByText("None left")).toBeInTheDocument();
    });

    it("renders long titles and special characters as plain text", () => {
        render(<BookRow book={book({ title: "<script>alert(1)</script> " + "x".repeat(300), authors: "O'Brien & Sons" })} />);
        expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeInTheDocument();
        expect(screen.getByText("O'Brien & Sons")).toBeInTheDocument();
        expect(document.querySelector("script")).toBeNull();
    });
});

describe("skeletons and footer", () => {
    it("BookRowSkeleton is hidden from assistive tech", () => {
        const { container } = render(<BookRowSkeleton />);
        expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    });
    it.each([[undefined, 6], [0, 0], [1, 1], [8, 8]])("BookListSkeleton count=%s renders %i rows", (count, expected) => {
        const { container } = render(<BookListSkeleton count={count} className="x" />);
        expect(container.querySelectorAll(".bk-row")).toHaveLength(expected);
        expect(container.firstChild).toHaveClass("x");
    });
    it("LoadingFooter shows only while loading more", () => {
        const { container, rerender } = render(<LoadingFooter context={{ loadingMore: false }} />);
        expect(container).toBeEmptyDOMElement();
        rerender(<LoadingFooter context={{ loadingMore: true }} />);
        expect(screen.getByText("Loading more...")).toBeInTheDocument();
    });
});

describe("ReadingBooks", () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-09T12:00:00Z")); });
    afterEach(() => vi.useRealTimers());
    const borrowed = (id: number, title: string, daysAgo: number) => ({ id, title, authors: "A. Author", borrowedDate: new Date(Date.parse("2026-11-09T12:00:00Z") - daysAgo * 86400000).toISOString() });

    it("shows the loading view while the list is not available yet", () => {
        render(<ReadingBooks />);
        expect(screen.getByRole("status")).toHaveTextContent("Loading");
        expect(screen.queryByRole("heading", { name: "Reading" })).not.toBeInTheDocument();
    });

    it("shows a friendly empty state", () => {
        render(<ReadingBooks books={[]} />);
        expect(screen.getByRole("heading", { level: 1, name: "Reading" })).toBeInTheDocument();
        expect(screen.getByText("No books currently borrowed")).toBeInTheDocument();
        expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("lists each book with its date and how long ago", () => {
        render(<ReadingBooks books={[borrowed(1, "Dune", 3), borrowed(2, "Emma", 45)]} />);
        const rows = screen.getAllByRole("listitem");
        expect(rows).toHaveLength(2);
        expect(within(rows[0]).getByText("Dune")).toBeInTheDocument();
        expect(within(rows[0]).getByText("6 Nov 2026")).toBeInTheDocument();
        expect(within(rows[0]).getByText("3 days ago")).toBeInTheDocument();
        expect(within(rows[1]).getByText("1 month ago")).toBeInTheDocument();
    });

    it("says '1 book' / '2 books'", () => {
        const { rerender } = render(<ReadingBooks books={[borrowed(1, "A", 1)]} />);
        expect(screen.getByText("1 book borrowed")).toBeInTheDocument();
        rerender(<ReadingBooks books={[borrowed(1, "A", 1), borrowed(2, "B", 1)]} />);
        expect(screen.getByText("2 books borrowed")).toBeInTheDocument();
    });

    it("shows 'Today' for a book borrowed minutes ago", () => {
        render(<ReadingBooks books={[borrowed(1, "A", 0)]} />);
        expect(screen.getByText("Today")).toBeInTheDocument();
    });
});

describe("PastReads", () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-09T12:00:00Z")); });
    afterEach(() => vi.useRealTimers());
    const past = (id: number, from: string, to: string) => ({ id, title: `Book ${id}`, authors: "A", borrowedDate: from, returnedDate: to });

    it("shows a friendly empty state", () => {
        render(<PastReads books={[]} />);
        expect(screen.getByRole("heading", { level: 1, name: "Past reads" })).toBeInTheDocument();
        expect(screen.getByText("No past reads yet")).toBeInTheDocument();
    });

    it("shows borrowed date, returned date and how long it was kept", () => {
        render(<PastReads books={[past(1, "2026-01-01T12:00:00Z", "2026-01-15T12:00:00Z")]} />);
        const row = screen.getByRole("listitem");
        expect(within(row).getByText("1 Jan 2026")).toBeInTheDocument();
        expect(within(row).getByText("15 Jan 2026")).toBeInTheDocument();
        expect(within(row).getByText("14 days")).toBeInTheDocument();
    });

    it("says 'Same day' for a book returned the day it was borrowed", () => {
        render(<PastReads books={[past(1, "2026-03-03T09:00:00Z", "2026-03-03T17:00:00Z")]} />);
        expect(screen.getByText("Same day")).toBeInTheDocument();
    });

    it("counts books correctly, singular and plural", () => {
        const one = past(1, "2026-01-01T12:00:00Z", "2026-01-02T12:00:00Z");
        const { rerender } = render(<PastReads books={[one]} />);
        expect(screen.getByText("1 book returned")).toBeInTheDocument();
        rerender(<PastReads books={[one, { ...one, id: 2 }]} />);
        expect(screen.getByText("2 books returned")).toBeInTheDocument();
    });

    it("keeps the same title twice when it was read twice", () => {
        const a = past(1, "2026-01-01T12:00:00Z", "2026-01-02T12:00:00Z");
        render(<PastReads books={[a, { ...a, id: 2 }]} />);
        expect(screen.getAllByText("Book 1")).toHaveLength(2);
    });
});

describe("LoadingView (loading.tsx)", () => {
    it("is a polite status region with a screen-reader label and a decorative animation", () => {
        render(<LoadingView />);
        const status = screen.getByRole("status");
        expect(status).toHaveAttribute("aria-live", "polite");
        expect(status).toHaveTextContent("Loading");
        const img = status.querySelector("img")!;
        expect(img).toHaveAttribute("alt", "");
        expect(img.getAttribute("src")).toBe("/library-loading.gif");
        expect(img).toHaveAttribute("width", "240");
    });
    it("can be small and carry a custom message", () => {
        render(<LoadingView smallScreen message="Fetching books" />);
        const status = screen.getByRole("status");
        expect(status).toHaveTextContent("Fetching books");
        expect(status.querySelector("img")).toHaveAttribute("width", "160");
        expect(status).not.toHaveClass("loading-fullscreen");
    });
});

describe("small UI pieces", () => {
    it("BookCover shortens long titles, cycles colours every 10", () => {
        const { container, rerender } = render(<BookCover title={"x".repeat(40)} author="A" index={3} />);
        expect(screen.getByRole("heading")).toHaveTextContent("x".repeat(30) + "...");
        expect(container.firstChild).toHaveClass("color3");
        rerender(<BookCover title={"x".repeat(30)} author="A" index={13} />);
        expect(screen.getByRole("heading")).toHaveTextContent("x".repeat(30));
        expect(screen.getByRole("heading").textContent).not.toContain("...");
        expect(container.firstChild).toHaveClass("color3");
    });

    it("IconButton is a labelled button that respects disabled", () => {
        const onClick = vi.fn();
        const { rerender } = render(<IconButton icon={<i />} title="Cancel scan" onClick={onClick} />);
        const b = screen.getByRole("button", { name: "Cancel scan" });
        expect(b).toHaveAttribute("type", "button");
        b.click();
        expect(onClick).toHaveBeenCalledTimes(1);
        rerender(<IconButton icon={<i />} title="Cancel scan" onClick={onClick} disabled />);
        expect(screen.getByRole("button")).toBeDisabled();
    });

    it("PrimaryButton shows its icon and title, and can be disabled", () => {
        const onClick = vi.fn();
        const { rerender } = render(<PrimaryButton title="Scan" onClick={onClick}><span data-testid="ic" /></PrimaryButton>);
        expect(screen.getByRole("button", { name: "Scan" })).toBeInTheDocument();
        expect(screen.getByTestId("ic")).toBeInTheDocument();
        screen.getByRole("button").click();
        expect(onClick).toHaveBeenCalledTimes(1);
        rerender(<PrimaryButton title="Scan" onClick={onClick} disabled />);
        expect(screen.getByRole("button")).toBeDisabled();
    });

    it("StepIcon shows the brand", () => {
        render(<StepIcon />);
        expect(screen.getByText("STEP")).toBeInTheDocument();
        expect(screen.getByText("Library")).toBeInTheDocument();
    });

    it("BackLink goes to the Manage hub", () => {
        render(<BackLink />);
        expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/manage");
    });
});
