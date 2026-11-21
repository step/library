import { describe, it, expect, vi, beforeEach } from "vitest";
import { insertBook, insertUser, openLoan, q } from "../../../../../test/integration/fixtures";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));
vi.mock("@/app/lib/auth", () => ({ authOptions: {} }));

import { fetchActivity, fetchOverdueLoans, fetchTopReaders, getInsightsOverview } from "../action";

const signedInAs = (email: string | null) => {
    session.current = email ? { user: { email, name: "x" } } : null;
};

beforeEach(async () => {
    signedInAs(null);
    await insertUser({ email: "boss@x.com", isAdmin: true });
    await insertUser({ email: "mia@x.com", name: "Mia" });
});

const today = () => new Date().toISOString().slice(0, 10);

describe("insights actions: access", () => {
    const calls = {
        getInsightsOverview: () => getInsightsOverview(),
        fetchActivity: () => fetchActivity("d90"),
        fetchTopReaders: () => fetchTopReaders({ from: "2026-01-01", to: today(), limit: 10 }),
        fetchOverdueLoans: () => fetchOverdueLoans(),
    };

    for (const [name, call] of Object.entries(calls)) {
        it(`${name} refuses anonymous callers, members and unknown Google accounts`, async () => {
            for (const who of [null, "mia@x.com", "stranger@x.com"]) {
                signedInAs(who);
                await expect(call()).rejects.toThrow(/Access denied/);
            }
        });
    }
});

describe("insights actions: for an admin", () => {
    beforeEach(() => signedInAs("boss@x.com"));

    it("loads every section of the page at once", async () => {
        const [mia] = await q<{ id: number }>(`SELECT id FROM library_users WHERE email = 'mia@x.com'`);
        const book = await insertBook({ title: "Dune", copies: 2 });
        const loan = await openLoan(book.copyIds[0], mia.id);
        await q(`UPDATE borrowed_books SET borrowed_at = now() - interval '70 days' WHERE id = $1`, [loan]);

        const o = await getInsightsOverview();
        expect(o.headline).toMatchObject({ copies: 2, copiesOut: 1, members: 2, overdue: 1 });
        expect(o.activity).toHaveLength(13);
        expect(o.loanAge.find(b => b.label === "Over 2 months")!.count).toBe(1);
        // The loan from 70 days ago falls inside the default 90-day period.
        expect(o.topReaders).toMatchObject({
            limit: 10, to: today(), totalReaders: 1, totalBorrows: 1,
            readers: [{ name: "Mia", count: 1, rank: 1, readingNow: true }],
        });
        expect(o.idleBooks).toEqual([]);
        expect(o.batches).toHaveLength(1);
        expect(await fetchOverdueLoans()).toMatchObject([{ title: "Dune", readerName: "Mia", daysOut: 70 }]);
    });

    it("rejects an unknown activity period", async () => {
        await expect(fetchActivity("forever")).rejects.toThrow(/Unknown period/);
        expect(await fetchActivity("m12")).toHaveLength(12);
    });

    it("answers a bad top-readers request with a message instead of querying", async () => {
        expect(await fetchTopReaders({ from: "2026-12-01", to: "2026-01-01", limit: 10 }))
            .toEqual({ ok: false, message: "Start date must be on or before the end date" });
        expect(await fetchTopReaders({ from: "2026-01-01", to: "2026-02-01", limit: 7 })).toMatchObject({ ok: false });
        expect(await fetchTopReaders({ from: "2026-01-01", to: today(), limit: 5 }))
            .toMatchObject({ ok: true, data: { limit: 5, readers: [] } });
    });
});
