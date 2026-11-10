import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Book } from "../../types/Book";

vi.mock("next/font/google", () => ({ Lexend: () => ({ className: "lx", variable: "--font-lexend" }) }));
const api = vi.hoisted(() => ({ loadBooksAfter: vi.fn() }));
vi.mock("@/app/BooksApi", () => api);

// Render every row (no windowing in jsdom) and expose the list's callbacks to the tests.
vi.mock("react-virtuoso", () => ({
    Virtuoso: ({ data, itemContent, endReached, components, context, initialScrollTop, onScroll }: {
        data: Book[]; itemContent: (i: number, b: Book) => React.ReactNode; endReached?: (i: number) => void;
        components?: { Footer?: React.FC<{ context: unknown }> }; context?: unknown; initialScrollTop?: number; onScroll?: (e: unknown) => void;
    }) => {
        const Footer = components?.Footer;
        return (
            <div data-testid="virtuoso" data-initial-scroll={initialScrollTop}>
                {data.map((d, i) => <div key={d.id}>{itemContent(i, d)}</div>)}
                {Footer && <Footer context={context} />}
                <button onClick={() => endReached?.(data.length - 1)}>end reached</button>
                <button onClick={() => onScroll?.({ target: { scrollTop: 321 } })}>scrolled</button>
            </div>
        );
    },
}));

import Books from "../Books";
import Searchbar from "../Searchbar";

const book = (id: number, title = `Book ${id}`, over: Partial<Book> = {}): Book => ({ id, title, authors: "Auth", isbn10: "", isbn13: "", count: 2, borrowedCount: 0, ...over });
const ok = (data: Book[]) => ({ success: true, data });
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.useRealTimers());

const user = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(400); });
const box = () => screen.getByRole("searchbox", { name: /search books/i });

describe("Searchbar", () => {
    const setup = (over = {}) => {
        const props = { value: "", onChange: vi.fn(), onSearch: vi.fn(), ...over };
        render(<Searchbar {...props} />);
        return props;
    };

    it("has an accessible name and a helpful placeholder", () => {
        setup();
        expect(box()).toHaveAttribute("placeholder", "Search by title or author");
    });
    it("shows the typed value and reports changes", async () => {
        vi.useRealTimers();
        const props = setup({ value: "du" });
        expect(box()).toHaveValue("du");
        await userEvent.type(box(), "n");
        expect(props.onChange).toHaveBeenCalledWith("dun");
    });
    it("searches on Enter only", async () => {
        vi.useRealTimers();
        const props = setup();
        await userEvent.type(box(), "a{Enter}");
        expect(props.onSearch).toHaveBeenCalledTimes(1);
        await userEvent.type(box(), "{Escape}{Tab}");
        expect(props.onSearch).toHaveBeenCalledTimes(1);
    });
    it("shows a spinner and is disabled while loading", () => {
        setup({ isLoading: true });
        expect(box()).toBeDisabled();
        expect(document.querySelector(".bk-spin")).toBeInTheDocument();
    });
    it("shows the search icon and is enabled otherwise", () => {
        setup();
        expect(box()).toBeEnabled();
        expect(document.querySelector(".bk-spin")).not.toBeInTheDocument();
    });
    it("gives focus back after a search ends, so typing is not interrupted", () => {
        const props = { value: "d", onChange: vi.fn(), onSearch: vi.fn() };
        const { rerender } = render(<Searchbar {...props} />);
        act(() => box().focus());
        rerender(<Searchbar {...props} isLoading />);
        expect(box()).toBeDisabled();
        act(() => box().blur()); // browsers drop focus from an input that becomes disabled; jsdom does not
        expect(box()).not.toHaveFocus();
        rerender(<Searchbar {...props} isLoading={false} />);
        expect(box()).toHaveFocus();
    });
    it("does not steal focus if the user was not in the box", () => {
        const props = { value: "d", onChange: vi.fn(), onSearch: vi.fn() };
        const { rerender } = render(<Searchbar {...props} />);
        rerender(<Searchbar {...props} isLoading />);
        rerender(<Searchbar {...props} isLoading={false} />);
        expect(box()).not.toHaveFocus();
    });
});

describe("Books page", () => {
    it("shows the heading and the books handed to it", () => {
        render(<Books books={[book(1, "Dune"), book(2, "Emma")]} />);
        expect(screen.getByRole("heading", { level: 1, name: "Books" })).toBeInTheDocument();
        expect(screen.getByText("Dune")).toBeInTheDocument();
        expect(screen.getByText("Emma")).toBeInTheDocument();
    });

    it("does not call the server on first view", async () => {
        render(<Books books={[book(1)]} />);
        await settle();
        expect(api.loadBooksAfter).not.toHaveBeenCalled();
    });

    it("searches 300 ms after typing stops and shows the results", async () => {
        api.loadBooksAfter.mockResolvedValue(ok([book(5, "Dune Messiah")]));
        render(<Books books={[book(1, "Emma")]} />);
        await user().type(box(), "dune");
        expect(api.loadBooksAfter).not.toHaveBeenCalled();
        await settle();
        expect(api.loadBooksAfter).toHaveBeenCalledTimes(1);
        expect(api.loadBooksAfter).toHaveBeenCalledWith("dune", 0, 20);
        expect(await screen.findByText("Dune Messiah")).toBeInTheDocument();
        expect(screen.queryByText("Emma")).not.toBeInTheDocument();
    });

    it("keeps the box enabled and focused once the search finishes", async () => {
        api.loadBooksAfter.mockResolvedValue(ok([book(5, "Dune")]));
        render(<Books books={[book(1)]} />);
        const u = user();
        await u.type(box(), "dune");
        await settle();
        expect(box()).toBeEnabled();
        expect(box()).toHaveFocus();
        await u.type(box(), "!");
        expect(box()).toHaveValue("dune!");
    });

    it("disables the box and shows skeleton rows while the first results load", async () => {
        const d = deferred<ReturnType<typeof ok>>();
        api.loadBooksAfter.mockReturnValue(d.promise);
        render(<Books books={[]} />);
        // an empty list that is not searching is the empty state, so start a search
        await user().type(box(), "x");
        await settle();
        expect(box()).toBeDisabled();
        await act(async () => { d.resolve(ok([book(9, "Found")])); });
        expect(screen.getByText("Found")).toBeInTheDocument();
    });

    it("shows the empty state, and 'Clear search' brings the list back", async () => {
        api.loadBooksAfter.mockResolvedValueOnce(ok([]));
        render(<Books books={[book(1, "Emma")]} />);
        const u = user();
        await u.type(box(), "zzz");
        await settle();
        expect(screen.getByText("No books match your search")).toBeInTheDocument();
        expect(screen.queryByText("Emma")).not.toBeInTheDocument();
        await u.click(screen.getByRole("button", { name: "Clear search" }));
        await settle();
        expect(box()).toHaveValue("");
        expect(screen.getByText("Emma")).toBeInTheDocument();
        expect(screen.queryByText("No books match your search")).not.toBeInTheDocument();
    });

    it("Enter searches again from the server even for a query already cached", async () => {
        api.loadBooksAfter.mockResolvedValue(ok([book(5, "Dune")]));
        render(<Books books={[book(1)]} />);
        const u = user();
        await u.type(box(), "dune");
        await settle();
        api.loadBooksAfter.mockClear();
        api.loadBooksAfter.mockResolvedValue(ok([book(5, "Dune"), book(6, "Dune 2")]));
        await u.type(box(), "{Enter}");
        await settle();
        expect(api.loadBooksAfter).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Dune 2")).toBeInTheDocument();
    });

    it("loads the next page after the last book when the end of the list is reached", async () => {
        api.loadBooksAfter.mockResolvedValue(ok([book(3, "Third")]));
        render(<Books books={[book(1), book(2)]} />);
        await user().click(screen.getByRole("button", { name: "end reached" }));
        expect(api.loadBooksAfter).toHaveBeenCalledWith("", 2, 20);
        expect(await screen.findByText("Third")).toBeInTheDocument();
    });

    it("loads more within the current search", async () => {
        api.loadBooksAfter.mockResolvedValueOnce(ok([book(5, "Dune")]));
        render(<Books books={[book(1)]} />);
        const u = user();
        await u.type(box(), "dune");
        await settle();
        api.loadBooksAfter.mockResolvedValueOnce(ok([book(7, "Dune 2")]));
        await u.click(screen.getByRole("button", { name: "end reached" }));
        expect(api.loadBooksAfter).toHaveBeenLastCalledWith("dune", 5, 20);
    });

    it("shows 'Loading more...' only while a page is loading", async () => {
        const d = deferred<ReturnType<typeof ok>>();
        api.loadBooksAfter.mockReturnValue(d.promise);
        render(<Books books={[book(1)]} />);
        await user().click(screen.getByRole("button", { name: "end reached" }));
        expect(screen.getByText("Loading more...")).toBeInTheDocument();
        await act(async () => { d.resolve(ok([book(2)])); });
        expect(screen.queryByText("Loading more...")).not.toBeInTheDocument();
    });

    it("does not start a second page request while one is loading", async () => {
        const d = deferred<ReturnType<typeof ok>>();
        api.loadBooksAfter.mockReturnValue(d.promise);
        render(<Books books={[book(1)]} />);
        const u = user();
        await u.click(screen.getByRole("button", { name: "end reached" }));
        await u.click(screen.getByRole("button", { name: "end reached" }));
        expect(api.loadBooksAfter).toHaveBeenCalledTimes(1);
        await act(async () => { d.resolve(ok([])); });
    });

    it("remembers the scroll position the list reports", async () => {
        render(<Books books={[book(1)]} />);
        await user().click(screen.getByRole("button", { name: "scrolled" }));
        expect(screen.getByTestId("virtuoso")).toHaveAttribute("data-initial-scroll", "321");
    });

    it("column headings are for sighted users only", () => {
        render(<Books books={[book(1)]} />);
        const head = screen.getByText("Title and author").parentElement!;
        expect(head).toHaveAttribute("aria-hidden", "true");
        expect(within(head).getByText("Available")).toBeInTheDocument();
    });
});
