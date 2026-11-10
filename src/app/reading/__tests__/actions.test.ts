// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ getLoggedInUser: vi.fn(), getBorrowedBooks: vi.fn(), getReturnedBooks: vi.fn() }));
vi.mock("../../../../db/user", () => ({ getLoggedInUser: m.getLoggedInUser }));
vi.mock("../../../../db/borrowedBooks", () => ({ getBorrowedBooks: m.getBorrowedBooks, getReturnedBooks: m.getReturnedBooks }));

import { loadReadingBooks } from "../action";
import { loadReturnedBooks } from "../../history/action";

beforeEach(() => vi.clearAllMocks());

describe.each([
    ["loadReadingBooks", loadReadingBooks, () => m.getBorrowedBooks],
    ["loadReturnedBooks", loadReturnedBooks, () => m.getReturnedBooks],
])("%s", (_n, load, query) => {
    it("refuses when nobody is signed in, and queries nothing", async () => {
        m.getLoggedInUser.mockResolvedValue(null);
        await expect(load()).rejects.toThrow("User not logged in");
        expect(query()).not.toHaveBeenCalled();
    });
    it("asks for the signed-in user's own books only", async () => {
        m.getLoggedInUser.mockResolvedValue({ id: 42 });
        query().mockResolvedValue([{ id: 1 }]);
        expect(await load()).toEqual([{ id: 1 }]);
        expect(query()).toHaveBeenCalledWith(42);
    });
});
