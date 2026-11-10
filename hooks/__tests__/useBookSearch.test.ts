import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Book } from "../../types/Book";

const api = vi.hoisted(() => ({ loadBooksAfter: vi.fn() }));
vi.mock("@/app/BooksApi", () => ({ loadBooksAfter: api.loadBooksAfter }));

import { useBookSearch } from "../useBookSearch";

const book = (id: number, title = `Book ${id}`): Book => ({
    id, title, authors: "A", isbn10: "", isbn13: "", count: 1, borrowedCount: 0,
});
const INITIAL = [book(1), book(2)];

/** A promise we resolve by hand, to control the order responses arrive in. */
const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
};
const ok = (data: Book[]) => ({ success: true, data });

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const wait = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

const setup = () => renderHook(() => useBookSearch({ initialBooks: INITIAL }));

beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers();
    api.loadBooksAfter.mockReset();
    api.loadBooksAfter.mockResolvedValue(ok([]));
});
afterEach(() => vi.useRealTimers());

const type = async (result: { current: ReturnType<typeof useBookSearch> }, q: string) => {
    act(() => result.current.setSearchQuery(q));
};

describe("initial state", () => {
    it("shows the server-provided books straight away", () => {
        const { result } = setup();
        expect(result.current.books).toEqual(INITIAL);
        expect(result.current.searchQuery).toBe("");
        expect(result.current.isSearching).toBe(false);
        expect(result.current.loadingMore).toBe(false);
    });

    it("does not refetch the first page on mount, and shows no spinner", async () => {
        api.loadBooksAfter.mockResolvedValue(ok([book(9)]));
        const { result } = setup();
        await flush();
        expect(api.loadBooksAfter).not.toHaveBeenCalled();
        expect(result.current.books).toEqual(INITIAL);
        expect(result.current.isSearching).toBe(false);
    });

    it("returns to the initial books when the search box is cleared", async () => {
        const { result } = setup();
        api.loadBooksAfter.mockResolvedValue(ok([book(5, "Dune")]));
        await type(result, "dune");
        await wait(300);
        expect(result.current.books).toEqual([book(5, "Dune")]);
        api.loadBooksAfter.mockClear();
        await type(result, "");
        await wait(300);
        expect(result.current.books).toEqual(INITIAL);
        expect(api.loadBooksAfter).not.toHaveBeenCalled();
    });
});

describe("typing (debounce)", () => {
    it("does not fetch before 300 ms and fetches once after", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockClear();
        await type(result, "dune");
        await wait(299);
        expect(api.loadBooksAfter).not.toHaveBeenCalled();
        await wait(1);
        expect(api.loadBooksAfter).toHaveBeenCalledTimes(1);
        expect(api.loadBooksAfter).toHaveBeenCalledWith("dune", 0, 20);
    });

    it("typing quickly fetches only the final text", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockClear();
        for (const q of ["d", "du", "dun", "dune"]) {
            await type(result, q);
            await wait(100);
        }
        await wait(300);
        expect(api.loadBooksAfter).toHaveBeenCalledTimes(1);
        expect(api.loadBooksAfter).toHaveBeenCalledWith("dune", 0, 20);
    });

    it("fetches exactly once per new query (no repeat fetch when the cache updates)", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockClear();
        api.loadBooksAfter.mockResolvedValue(ok([book(5, "Dune")]));
        await type(result, "dune");
        await wait(300);
        await wait(1000);
        expect(api.loadBooksAfter).toHaveBeenCalledTimes(1);
    });

    it("sets isSearching while the request is in flight", async () => {
        const { result } = setup();
        await flush();
        const d = deferred<ReturnType<typeof ok>>();
        api.loadBooksAfter.mockReturnValueOnce(d.promise);
        await type(result, "x");
        await wait(300);
        expect(result.current.isSearching).toBe(true);
        await act(async () => { d.resolve(ok([book(7)])); });
        expect(result.current.isSearching).toBe(false);
        expect(result.current.books).toEqual([book(7)]);
    });
});

describe("cache", () => {
    it("serves a repeated query from the cache without fetching", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockResolvedValueOnce(ok([book(5, "Dune")]));
        await type(result, "dune");
        await wait(300);
        api.loadBooksAfter.mockResolvedValueOnce(ok([book(6, "Emma")]));
        await type(result, "emma");
        await wait(300);
        api.loadBooksAfter.mockClear();

        await type(result, "dune");
        await wait(300);
        expect(api.loadBooksAfter).not.toHaveBeenCalled();
        expect(result.current.books).toEqual([book(5, "Dune")]);
        expect(result.current.isSearching).toBe(false);
    });

    it("performSearch(query, false) bypasses the cache", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockResolvedValue(ok([book(5, "Dune")]));
        await type(result, "dune");
        await wait(300);
        api.loadBooksAfter.mockClear();
        api.loadBooksAfter.mockResolvedValue(ok([book(5, "Dune"), book(6, "Dune Messiah")]));
        await act(async () => { await result.current.performSearch("dune", false); });
        expect(api.loadBooksAfter).toHaveBeenCalledTimes(1);
        expect(result.current.books).toHaveLength(2);
    });

    it("shows and caches an empty result for a query with no matches", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockResolvedValue(ok([]));
        await type(result, "zzzz");
        await wait(300);
        expect(result.current.books).toEqual([]);
        api.loadBooksAfter.mockClear();
        await type(result, "");
        await wait(300);
        await type(result, "zzzz");
        await wait(300);
        expect(api.loadBooksAfter).not.toHaveBeenCalledWith("zzzz", 0, 20);
    });
});

describe("failures", () => {
    it("keeps the previous books when the API reports failure", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockResolvedValueOnce(ok([book(5)]));
        await type(result, "a");
        await wait(300);
        api.loadBooksAfter.mockResolvedValueOnce({ success: false, data: { message: "nope" } });
        await type(result, "ab");
        await wait(300);
        expect(result.current.books).toEqual([book(5)]);
        expect(result.current.isSearching).toBe(false);
    });

    it("keeps the previous books and stops the spinner when the call throws", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockRejectedValueOnce(new Error("offline"));
        await type(result, "a");
        await wait(300);
        expect(result.current.isSearching).toBe(false);
    });

    it("does not cache a failed search, so the next try fetches again", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockResolvedValueOnce({ success: false, data: {} });
        await type(result, "a");
        await wait(300);
        api.loadBooksAfter.mockClear();
        api.loadBooksAfter.mockResolvedValue(ok([book(5)]));
        await act(async () => { await result.current.performSearch("a"); });
        expect(api.loadBooksAfter).toHaveBeenCalledTimes(1);
    });
});

describe("responses that claim success but cannot be trusted", () => {
    it("ignores books that come with a failure flag", async () => {
        const { result } = setup();
        api.loadBooksAfter.mockResolvedValue({ success: false, data: [book(99, "Bogus")] });
        await type(result, "a");
        await wait(300);
        expect(result.current.books).toEqual(INITIAL);
    });
    it("ignores a successful response whose data is not a list", async () => {
        const { result } = setup();
        api.loadBooksAfter.mockResolvedValue({ success: true, data: { message: "oops" } });
        await type(result, "a");
        await wait(300);
        expect(result.current.books).toEqual(INITIAL);
    });
    it("loadMore ignores books that come with a failure flag", async () => {
        const { result } = setup();
        api.loadBooksAfter.mockResolvedValue({ success: false, data: [book(99, "Bogus")] });
        await act(async () => { await result.current.loadMore("", 2); });
        expect(result.current.books).toEqual(INITIAL);
    });
});

describe("returning to the empty search", () => {
    it("shows only the first page again, even after more pages were loaded before", async () => {
        const { result } = setup();
        api.loadBooksAfter.mockResolvedValueOnce(ok([book(3)]));
        await act(async () => { await result.current.loadMore("", 2); });
        expect(result.current.books.map(b => b.id)).toEqual([1, 2, 3]);
        api.loadBooksAfter.mockResolvedValue(ok([book(8, "Dune")]));
        await type(result, "dune");
        await wait(300);
        await type(result, "");
        await wait(300);
        expect(result.current.books.map(b => b.id)).toEqual([1, 2]);
    });
});

describe("race conditions", () => {
    it("shows the newest search even if an older one finishes last", async () => {
        const { result } = setup();
        await flush();
        const a = deferred<ReturnType<typeof ok>>();
        const b = deferred<ReturnType<typeof ok>>();
        api.loadBooksAfter.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);

        await type(result, "a");
        await wait(300);
        await type(result, "ab");
        await wait(300);

        await act(async () => { b.resolve(ok([book(2, "ab-result")])); });
        await act(async () => { a.resolve(ok([book(1, "a-result")])); });

        expect(result.current.books).toEqual([book(2, "ab-result")]);
        expect(result.current.isSearching).toBe(false);
    });

    it("an older response does not hide the spinner of the newer search", async () => {
        const { result } = setup();
        await flush();
        const a = deferred<ReturnType<typeof ok>>();
        const b = deferred<ReturnType<typeof ok>>();
        api.loadBooksAfter.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
        await type(result, "a"); await wait(300);
        await type(result, "ab"); await wait(300);
        await act(async () => { a.resolve(ok([book(1)])); });
        expect(result.current.isSearching).toBe(true);
        await act(async () => { b.resolve(ok([book(2)])); });
        expect(result.current.isSearching).toBe(false);
    });
});

describe("duplicate fetches", () => {
    it("a finished search for one query does not re-fetch a different query that is still loading", async () => {
        const { result } = setup();
        await flush();
        const a = deferred<ReturnType<typeof ok>>();
        const b = deferred<ReturnType<typeof ok>>();
        api.loadBooksAfter.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
        await type(result, "a"); await wait(300);
        await type(result, "ab"); await wait(300);
        await act(async () => { a.resolve(ok([book(1)])); });
        await wait(1000);
        expect(api.loadBooksAfter).toHaveBeenCalledTimes(2);
    });
});

describe("loadMore", () => {
    const withBooks = async () => {
        const hook = setup();
        await flush();
        api.loadBooksAfter.mockClear();
        return hook;
    };

    it("appends the next page after the given id", async () => {
        const { result } = await withBooks();
        api.loadBooksAfter.mockResolvedValue(ok([book(3), book(4)]));
        await act(async () => { await result.current.loadMore("", 2); });
        expect(api.loadBooksAfter).toHaveBeenCalledWith("", 2, 20);
        expect(result.current.books.map(b => b.id)).toEqual([1, 2, 3, 4]);
    });

    it("keeps earlier books when appending", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockResolvedValue(ok([book(3)]));
        await act(async () => { await result.current.loadMore("", 2); });
        expect(result.current.books.map(b => b.id)).toEqual([1, 2, 3]);
    });

    it("ignores an empty page", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockResolvedValue(ok([]));
        await act(async () => { await result.current.loadMore("", 1); });
        expect(result.current.books).toEqual(INITIAL);
    });

    it("ignores a failed page and clears the loading flag", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockResolvedValue({ success: false, data: {} });
        await act(async () => { await result.current.loadMore("", 1); });
        expect(result.current.books).toEqual(INITIAL);
        expect(result.current.loadingMore).toBe(false);
    });

    it("clears the loading flag when the call throws", async () => {
        const { result } = await withBooks();
        api.loadBooksAfter.mockRejectedValue(new Error("x"));
        await act(async () => { await result.current.loadMore("", 2); });
        expect(result.current.loadingMore).toBe(false);
    });

    it("does not start a second request while one is loading", async () => {
        const { result } = setup();
        await flush();
        const d = deferred<ReturnType<typeof ok>>();
        api.loadBooksAfter.mockReturnValueOnce(d.promise);
        act(() => { void result.current.loadMore("", 2); });
        expect(result.current.loadingMore).toBe(true);
        api.loadBooksAfter.mockClear();
        await act(async () => { await result.current.loadMore("", 2); });
        expect(api.loadBooksAfter).not.toHaveBeenCalled();
        await act(async () => { d.resolve(ok([book(3)])); });
        expect(result.current.books.map(b => b.id)).toEqual([1, 2, 3]);
    });

    it("extends the cached page for the query so a revisit shows all loaded books", async () => {
        const { result } = setup();
        await flush();
        api.loadBooksAfter.mockResolvedValueOnce(ok([book(1, "Dune")]));
        await type(result, "dune");
        await wait(300);
        api.loadBooksAfter.mockResolvedValueOnce(ok([book(2, "Dune 2")]));
        await act(async () => { await result.current.loadMore("dune", 1); });
        await type(result, "");
        await wait(300);
        api.loadBooksAfter.mockClear();
        await type(result, "dune");
        await wait(300);
        expect(api.loadBooksAfter).not.toHaveBeenCalled();
        expect(result.current.books.map(b => b.id)).toEqual([1, 2]);
    });
});
