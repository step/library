import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BatchEngagement, HeadlineStats as Stats, IdleBook, LoanAgeBucket, OverdueLoan } from "@/types/Insights";

vi.mock("../action", () => ({}));

import HeadlineStats from "../HeadlineStats";
import LineChart, { axisTop } from "../LineChart";
import LoanAge from "../LoanAge";
import IdleBooks from "../IdleBooks";
import BatchTable from "../BatchTable";
import OverdueLoans, { uniqueEmails } from "../overdue/OverdueLoans";

const STATS: Stats = { copies: 214, copiesOut: 38, members: 124, activeReaders: 52, overdue: 7, borrowsThisMonth: 56, borrowsSameTimeLastMonth: 50 };

describe("HeadlineStats", () => {
    it("shows the four numbers with their context", () => {
        render(<HeadlineStats stats={STATS} />);
        expect(screen.getByText("176 of 214 copies on the shelf")).toBeInTheDocument();
        expect(screen.getByText("42% of 124 members borrowed in the last 30 days")).toBeInTheDocument();
        expect(screen.getByText("Out for more than 60 days")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "See who has them" })).toHaveAttribute("href", "/manage/insights/overdue");
        expect(screen.getByText("Up 12% on this time last month")).toBeInTheDocument();
    });

    it("words the monthly change honestly, and hides the overdue link when there are none", () => {
        const { rerender } = render(<HeadlineStats stats={{ ...STATS, overdue: 0, borrowsThisMonth: 40 }} />);
        expect(screen.getByText("Down 20% on this time last month")).toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        rerender(<HeadlineStats stats={{ ...STATS, borrowsThisMonth: 50 }} />);
        expect(screen.getByText("Same as this time last month")).toBeInTheDocument();
        rerender(<HeadlineStats stats={{ ...STATS, borrowsSameTimeLastMonth: 0, copies: 0, copiesOut: 0, members: 0 }} />);
        expect(screen.getByText("Nothing to compare with last month yet")).toBeInTheDocument();
        expect(screen.getByText("0% of 0 members borrowed in the last 30 days")).toBeInTheDocument();
    });
});

describe("LineChart", () => {
    it("rounds the axis up to a number that halves cleanly", () => {
        expect([0, 3, 4, 5, 9, 26].map(axisTop)).toEqual([4, 4, 4, 8, 12, 28]);
    });

    it("draws both lines and gives screen readers the numbers as a table", () => {
        const points = [{ label: "1 Sep", borrowed: 3, returned: 1 }, { label: "8 Sep", borrowed: 5, returned: 4 }];
        const { container } = render(<LineChart points={points} caption="Borrows and returns per week" />);
        expect(container.querySelectorAll("polyline")).toHaveLength(2);
        expect(container.querySelector(".in-line-bor")!.getAttribute("points")).toBe("0,62.5 100,37.5");
        const table = screen.getByRole("table", { name: "Borrows and returns per week" });
        expect(within(table).getAllByRole("row").map(r => r.textContent)).toEqual(["Period startingBorrowedReturned", "1 Sep31", "8 Sep54"]);
    });

    it("labels at most five periods along the bottom, so they fit on a phone", () => {
        const points = Array.from({ length: 13 }, (_, i) => ({ label: `P${i}`, borrowed: i, returned: 0 }));
        const { container } = render(<LineChart points={points} caption="x" />);
        expect([...container.querySelectorAll(".in-chart-x span")].map(s => s.textContent)).toEqual(["P0", "P3", "P6", "P9", "P12"]);
    });
});

const BUCKETS: LoanAgeBucket[] = [
    { label: "Under 1 week", count: 12, overdue: false }, { label: "1–2 weeks", count: 9, overdue: false },
    { label: "2 weeks–1 month", count: 10, overdue: false }, { label: "1–2 months", count: 5, overdue: false },
    { label: "Over 2 months", count: 2, overdue: true },
];

describe("LoanAge", () => {
    it("lists each group, marks overdue ones for screen readers, and links to the overdue loans", () => {
        render(<LoanAge buckets={BUCKETS} overdue={2} />);
        expect(screen.getByText("The 38 copies out now, by time since they were borrowed")).toBeInTheDocument();
        const items = screen.getAllByRole("listitem").map(li => li.textContent);
        expect(items).toEqual(["Under 1 week12", "1–2 weeks9", "2 weeks–1 month10", "1–2 months5", "Over 2 months (overdue)2"]);
        expect(screen.getByText(/past the 60-day loan period/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "See overdue loans" })).toHaveAttribute("href", "/manage/insights/overdue");
    });

    it("says when nothing is overdue", () => {
        render(<LoanAge buckets={BUCKETS.map(b => ({ ...b, count: b.overdue ? 0 : 1 }))} overdue={0} />);
        expect(screen.getByText("No loans are past the 60-day loan period")).toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
});

const idle = (id: number, title: string, copies: number, lastBorrowed: string | null = null): IdleBook =>
    ({ id, title, authors: "Someone", copies, lastBorrowed });

describe("IdleBooks", () => {
    it("summarises, shows five, and expands to all", async () => {
        const books = [idle(1, "Mythical Man-Month", 9, "2026-03-04T10:00:00Z"), ...[2, 3, 4, 5, 6, 7].map(i => idle(i, `Book ${i}`, 1))];
        render(<IdleBooks books={books} />);
        expect(screen.getByText("7 books")).toBeInTheDocument();
        expect(screen.getByText("6 never borrowed · 15 copies")).toBeInTheDocument();
        expect(screen.getAllByRole("listitem")).toHaveLength(5);
        expect(screen.getByText("Last out Mar 2026")).toBeInTheDocument();

        const more = screen.getByRole("button", { name: "Show all 7 books" });
        expect(more).toHaveAttribute("aria-expanded", "false");
        await userEvent.click(more);
        expect(screen.getAllByRole("listitem")).toHaveLength(7);
        await userEvent.click(screen.getByRole("button", { name: "Show fewer" }));
        expect(screen.getAllByRole("listitem")).toHaveLength(5);
    });

    it("has no toggle for a short list, and a message for none", () => {
        const { rerender } = render(<IdleBooks books={[idle(1, "One", 1)]} />);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        expect(screen.getByText("1 book")).toBeInTheDocument();
        rerender(<IdleBooks books={[]} />);
        expect(screen.getByText("Every book has been borrowed in the last 6 months.")).toBeInTheDocument();
    });
});

const batch = (batchId: number, members: number, borrowers: number, borrows: number): BatchEngagement =>
    ({ batchId, members, borrowers, borrows, joined: "2026-10-05T09:00:00Z" });

describe("BatchTable", () => {
    it("shows each batch's members, share who borrowed, borrows per member and who never borrowed", () => {
        render(<BatchTable batches={[batch(15, 34, 12, 20), batch(14, 32, 21, 77)]} />);
        const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1).map(r => r.textContent);
        expect(rows).toEqual([
            "Batch 15First member added Oct 20263412 · 35%0.622",
            "Batch 14First member added Oct 20263221 · 66%2.411",
        ]);
        expect(screen.getByText(/Batch 15: 22 of 34 members have not borrowed yet/)).toBeInTheDocument();
    });

    it("drops the nudge when everyone in the newest batch has borrowed, and handles no members", () => {
        const { rerender } = render(<BatchTable batches={[batch(15, 3, 3, 9)]} />);
        expect(screen.queryByText(/have not borrowed yet/)).not.toBeInTheDocument();
        rerender(<BatchTable batches={[]} />);
        expect(screen.getByText("No members yet.")).toBeInTheDocument();
    });
});

const loan = (id: number, name: string, email: string, daysOut: number): OverdueLoan => ({
    id, readerName: name, readerEmail: email, batchId: 13, title: `Book ${id}`, authors: "A", daysOut,
    borrowedDate: new Date(Date.UTC(2026, 8, 1 + id)).toISOString(),
});

describe("OverdueLoans", () => {
    afterEach(() => vi.unstubAllGlobals());
    const LOANS = [loan(1, "Riya", "riya@x.com", 130), loan(2, "Arjun", "arjun@x.com", 90), loan(3, "Riya", "riya@x.com", 61)];

    it("lists each reader's address once", () => {
        expect(uniqueEmails(LOANS)).toEqual(["riya@x.com", "arjun@x.com"]);
    });

    it("summarises and lists the loans with a status", () => {
        render(<OverdueLoans loans={LOANS} />);
        expect(screen.getByText("Over 120 days").nextSibling).toHaveTextContent("1");
        expect(screen.getByText("60–120 days").nextSibling).toHaveTextContent("2");
        expect(screen.getByText("Readers to contact").nextSibling).toHaveTextContent("2");
        const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
        expect(rows.map(r => within(r).getByText(/overdue/i).textContent)).toEqual(["Very overdue", "Overdue", "Overdue"]);
        expect(rows[0]).toHaveTextContent("riya@x.com · Batch 13");
    });

    it("copies the addresses one per line, and says if it could not", async () => {
        const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("blocked"));
        vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
        render(<OverdueLoans loans={LOANS} />);
        await userEvent.click(screen.getByRole("button", { name: "Copy reader emails" }));
        expect(writeText).toHaveBeenCalledWith("riya@x.com\narjun@x.com");
        expect(screen.getByRole("status")).toHaveTextContent("Copied 2 emails, one per line.");
        await userEvent.click(screen.getByRole("button", { name: "Copy reader emails" }));
        expect(screen.getByRole("status")).toHaveTextContent("Could not copy");
    });

    it("says when nothing is overdue", () => {
        render(<OverdueLoans loans={[]} />);
        expect(screen.getByText("No overdue loans")).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
});
