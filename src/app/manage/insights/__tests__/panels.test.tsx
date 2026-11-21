import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActivityPoint, TopReaders } from "@/types/Insights";

const action = vi.hoisted(() => ({ fetchActivity: vi.fn(), fetchTopReaders: vi.fn() }));
vi.mock("../action", () => action);

import ActivityPanel from "../ActivityPanel";
import TopReadersPanel from "../TopReadersPanel";

beforeEach(() => vi.clearAllMocks());

const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>(r => { resolve = r; });
    return { promise, resolve };
};

const weeks = (n: number, borrowed = 2): ActivityPoint[] =>
    Array.from({ length: n }, (_, i) => ({ label: `W${i + 1}`, borrowed, returned: 1 }));

describe("ActivityPanel", () => {
    it("starts on 90 days and totals the period", () => {
        render(<ActivityPanel initial={weeks(13)} />);
        expect(screen.getByRole("button", { name: "90 days" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByText("Per week, last 90 days")).toBeInTheDocument();
        expect(screen.getByText("26 borrowed and 13 returned in this period.")).toBeInTheDocument();
    });

    it("loads another period when its button is pressed, and not again for the current one", async () => {
        action.fetchActivity.mockResolvedValue(weeks(12, 5));
        render(<ActivityPanel initial={weeks(13)} />);
        await userEvent.click(screen.getByRole("button", { name: "90 days" }));
        expect(action.fetchActivity).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole("button", { name: "12 months" }));
        expect(action.fetchActivity).toHaveBeenCalledWith("m12");
        expect(await screen.findByText("60 borrowed and 12 returned in this period.")).toBeInTheDocument();
        expect(screen.getByText("Per month, last 12 months")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "12 months" })).toHaveAttribute("aria-pressed", "true");
    });

    it("ignores a slow answer for a period the admin has already moved on from", async () => {
        const slow = deferred<ActivityPoint[]>();
        action.fetchActivity.mockImplementation((r: string) => (r === "m12" ? slow.promise : Promise.resolve(weeks(5, 1))));
        render(<ActivityPanel initial={weeks(13)} />);
        await userEvent.click(screen.getByRole("button", { name: "12 months" }));
        await userEvent.click(screen.getByRole("button", { name: "30 days" }));
        expect(await screen.findByText("5 borrowed and 5 returned in this period.")).toBeInTheDocument();
        slow.resolve(weeks(12, 9));
        await new Promise(r => setTimeout(r, 0));
        expect(screen.getByText("5 borrowed and 5 returned in this period.")).toBeInTheDocument();
    });

    it("says when the data cannot load, and retries", async () => {
        action.fetchActivity.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(weeks(5, 3));
        render(<ActivityPanel initial={weeks(13)} />);
        await userEvent.click(screen.getByRole("button", { name: "30 days" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load data");
        await userEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(await screen.findByText("15 borrowed and 5 returned in this period.")).toBeInTheDocument();
        expect(action.fetchActivity).toHaveBeenLastCalledWith("d30");
    });
});

const reader = (id: number, name: string, count: number, rank: number, readingNow = false) =>
    ({ id, name, batchId: 13, count, rank, readingNow });
const INITIAL: TopReaders = {
    from: "2026-08-23", to: "2026-11-21", limit: 10, totalReaders: 4, totalBorrows: 9,
    readers: [reader(1, "Ann", 4, 1, true), reader(2, "Bob", 2, 2), reader(3, "Cat", 2, 2), reader(4, "Dev", 1, 4)],
};

describe("TopReadersPanel", () => {
    it("shows the period, the ranking with shared ranks, and a footnote", () => {
        render(<TopReadersPanel initial={INITIAL} />);
        expect(screen.getByText("Most books borrowed, 23 Aug 2026 to 21 Nov 2026")).toBeInTheDocument();
        const rows = within(screen.getByRole("list")).getAllByRole("listitem");
        expect(rows.map(r => r.textContent)).toEqual([
            "Rank 1AnnBatch 134 booksReading now",
            "Rank 2BobBatch 132 books",
            "Rank 2CatBatch 132 books",
            "Rank 4DevBatch 131 book",
        ]);
        expect(screen.getByText(/Showing 4 of 4 readers who borrowed in this period · 9 borrows in total/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Last 90 days" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("combobox", { name: "Show" })).toHaveValue("10");
    });

    it("refetches with a quick period", async () => {
        action.fetchTopReaders.mockResolvedValue({ ok: true, data: { ...INITIAL, from: "2026-10-22", readers: INITIAL.readers.slice(0, 1), totalReaders: 1, totalBorrows: 4 } });
        render(<TopReadersPanel initial={INITIAL} />);
        await userEvent.click(screen.getByRole("button", { name: "Last 30 days" }));
        expect(action.fetchTopReaders).toHaveBeenCalledWith({ from: "2026-10-22", to: "2026-11-21", limit: 10 });
        expect(await screen.findByText("Most books borrowed, 22 Oct 2026 to 21 Nov 2026")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Last 30 days" })).toHaveAttribute("aria-pressed", "true");
        await userEvent.click(screen.getByRole("button", { name: "This year" }));
        expect(action.fetchTopReaders).toHaveBeenLastCalledWith({ from: "2026-01-01", to: "2026-11-21", limit: 10 });
    });

    it("refetches when the number to show changes", async () => {
        action.fetchTopReaders.mockResolvedValue({ ok: true, data: { ...INITIAL, limit: 5 } });
        render(<TopReadersPanel initial={INITIAL} />);
        await userEvent.selectOptions(screen.getByRole("combobox", { name: "Show" }), "5");
        expect(action.fetchTopReaders).toHaveBeenCalledWith({ from: "2026-08-23", to: "2026-11-21", limit: 5 });
        expect(within(screen.getByRole("combobox", { name: "Show" })).getAllByRole("option").map(o => o.textContent))
            .toEqual(["Top 5", "Top 10", "Top 20", "Top 50"]);
    });

    it("explains a start after the end without asking the server, and recovers when fixed", async () => {
        action.fetchTopReaders.mockResolvedValue({ ok: true, data: INITIAL });
        render(<TopReadersPanel initial={INITIAL} />);
        const from = screen.getByLabelText("From");
        await userEvent.clear(from);
        await userEvent.type(from, "2026-12-01");
        expect(screen.getByRole("alert")).toHaveTextContent("Start date must be on or before the end date");
        expect(from).toHaveAttribute("aria-invalid", "true");
        expect(screen.queryByRole("list")).not.toBeInTheDocument();
        const calls = action.fetchTopReaders.mock.calls.filter(([q]) => q.from === "2026-12-01");
        expect(calls).toHaveLength(0);

        await userEvent.click(screen.getByRole("button", { name: "Last 90 days" }));
        await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
        expect(screen.getByRole("list")).toBeInTheDocument();
    });

    it("shows the server's message when it refuses a request", async () => {
        action.fetchTopReaders.mockResolvedValue({ ok: false, message: "Show top 5, 10, 20, 50" });
        render(<TopReadersPanel initial={INITIAL} />);
        await userEvent.click(screen.getByRole("button", { name: "This year" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Show top 5, 10, 20, 50");
    });

    it("says so when nobody borrowed, and offers the last 90 days", async () => {
        action.fetchTopReaders.mockResolvedValue({ ok: true, data: INITIAL });
        render(<TopReadersPanel initial={{ ...INITIAL, readers: [], totalReaders: 0, totalBorrows: 0 }} />);
        expect(screen.getByText("No books were borrowed in this period")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Show last 90 days" }));
        expect(action.fetchTopReaders).toHaveBeenCalledWith({ from: "2026-08-23", to: "2026-11-21", limit: 10 });
    });

    it("does not let dates go past the last day of the default period (today)", () => {
        render(<TopReadersPanel initial={INITIAL} />);
        expect(screen.getByLabelText("From")).toHaveAttribute("max", "2026-11-21");
        expect(screen.getByLabelText("To")).toHaveAttribute("max", "2026-11-21");
    });
});
