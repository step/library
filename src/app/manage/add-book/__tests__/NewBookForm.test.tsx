import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FakeBarcodeScanner, fakeScan, resetScanner } from "../../../../../test/helpers/fakes";

vi.mock("next/dynamic", () => ({ default: () => FakeBarcodeScanner }));

import NewBookForm from "../NewBookForm";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    vi.clearAllMocks();
    resetScanner();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const submit = () => userEvent.click(screen.getByRole("button", { name: /add book|adding/i }));
const fill = async (v: Partial<Record<"Title" | "Authors" | "ISBN 10" | "ISBN 13", string>>) => {
    for (const [label, value] of Object.entries(v)) {
        await userEvent.clear(field(label));
        if (value) await userEvent.type(field(label), value);
    }
};
const valid = { Title: "Dune", Authors: "Frank Herbert", "ISBN 13": "9780441172719" };
const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);
const scanCopy = async (code: string) => {
    fakeScan.code = code;
    await userEvent.click(screen.getByRole("button", { name: /scan copy qr code/i }));
    await userEvent.click(screen.getByText("fake scan ok"));
};

describe("NewBookForm: layout", () => {
    it("has the four fields, the scan options and a submit button", () => {
        render(<NewBookForm />);
        for (const l of ["Title", "Authors", "ISBN 10", "ISBN 13"]) expect(field(l)).toHaveValue("");
        expect(screen.getByRole("button", { name: /scan isbn/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /scan copy qr code/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Add book" })).toBeEnabled();
        expect(screen.getByText(/No copies yet/)).toBeInTheDocument();
    });
});

describe("NewBookForm: validation", () => {
    it("an empty form shows every problem and sends nothing", async () => {
        render(<NewBookForm />);
        await submit();
        expect(screen.getByText("Enter a title")).toBeInTheDocument();
        expect(screen.getByText("Enter at least one author")).toBeInTheDocument();
        expect(screen.getByText("Enter at least one ISBN")).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("marks invalid fields for assistive tech and links them to their messages", async () => {
        render(<NewBookForm />);
        await submit();
        const title = field("Title");
        expect(title).toHaveAttribute("aria-invalid", "true");
        expect(title).toHaveAccessibleDescription(expect.stringContaining("Enter a title"));
    });

    it.each([["", false], ["a", false], [" a ", false], ["ab", true], ["  ab  ", true]])("title %j valid=%s", async (title, valid_) => {
        render(<NewBookForm />);
        await fill({ ...valid, Title: title });
        fetchMock.mockResolvedValue(json({}));
        await submit();
        expect(screen.queryByText("Enter a title") === null).toBe(valid_);
    });

    it.each([["x", false], ["Al", true]])("authors %j valid=%s", async (authors, valid_) => {
        render(<NewBookForm />);
        await fill({ ...valid, Authors: authors });
        fetchMock.mockResolvedValue(json({}));
        await submit();
        expect(screen.queryByText("Enter at least one author") === null).toBe(valid_);
    });

    it.each([
        ["0441172717", true],
        ["044117271X", true],
        ["044117271x", true],
        ["0-441-17271-7", true],
        ["0441 17271 7", true],
        ["044117271", false],
        ["04411727177", false],
        ["044117271Y", false],
        ["X441172717", false],
    ])("ISBN 10 %j valid=%s", async (isbn, valid_) => {
        render(<NewBookForm />);
        await fill({ Title: "Dune", Authors: "FH", "ISBN 10": isbn });
        fetchMock.mockResolvedValue(json({}));
        await submit();
        expect(screen.queryByText(/ISBN 10 must have 10 characters/) === null).toBe(valid_);
    });

    it.each([
        ["9780441172719", true],
        ["978-0-441-17271-9", true],
        ["978044117271", false],
        ["97804411727190", false],
        ["978044117271X", false],
    ])("ISBN 13 %j valid=%s", async (isbn, valid_) => {
        render(<NewBookForm />);
        await fill({ Title: "Dune", Authors: "FH", "ISBN 13": isbn });
        fetchMock.mockResolvedValue(json({}));
        await submit();
        expect(screen.queryByText("ISBN 13 must have 13 digits") === null).toBe(valid_);
    });

    it("accepts a book with only an ISBN 10", async () => {
        fetchMock.mockResolvedValue(json({}));
        render(<NewBookForm />);
        await fill({ Title: "Dune", Authors: "FH", "ISBN 10": "0441172717" });
        await submit();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("typing in a field clears only that field's error", async () => {
        render(<NewBookForm />);
        await submit();
        await userEvent.type(field("Title"), "D");
        expect(screen.queryByText("Enter a title")).not.toBeInTheDocument();
        expect(screen.getByText("Enter at least one author")).toBeInTheDocument();
    });

    it.each(["ISBN 10", "ISBN 13"] as const)("typing in %s clears 'Enter at least one ISBN'", async (label) => {
        render(<NewBookForm />);
        await submit();
        expect(screen.getByText("Enter at least one ISBN")).toBeInTheDocument();
        await userEvent.type(field(label), "1");
        expect(screen.queryByText("Enter at least one ISBN")).not.toBeInTheDocument();
    });
});

describe("NewBookForm: saving", () => {
    it("posts the cleaned book, confirms, and empties the form", async () => {
        fetchMock.mockResolvedValue(json({ message: "ok" }));
        render(<NewBookForm />);
        await fill({ Title: "  Dune ", Authors: " Frank Herbert ", "ISBN 10": "0-441-17271-7", "ISBN 13": "978 0441172719" });
        await scanCopy("copy-1");
        await submit();
        expect(fetchMock).toHaveBeenCalledWith("/api/books/on-board", expect.objectContaining({ method: "POST" }));
        expect(sentBody()).toEqual({ title: "Dune", authors: "Frank Herbert", isbn10: "0441172717", isbn13: "9780441172719", copies: ["copy-1"] });
        expect(await screen.findByText("Successfully added book!")).toBeInTheDocument();
        expect(field("Title")).toHaveValue("");
        expect(field("ISBN 13")).toHaveValue("");
        expect(screen.getByText(/No copies yet/)).toBeInTheDocument();
    });

    it("leaves out an ISBN that was not filled in", async () => {
        fetchMock.mockResolvedValue(json({}));
        render(<NewBookForm />);
        await fill(valid);
        await submit();
        const body = sentBody();
        expect(body).not.toHaveProperty("isbn10");
        expect(body.isbn13).toBe("9780441172719");
        expect(body.copies).toEqual([]);
    });

    it("keeps what was typed and says so when the server refuses", async () => {
        fetchMock.mockResolvedValue(json({ message: "no" }, 500));
        render(<NewBookForm />);
        await fill(valid);
        await submit();
        expect(await screen.findByText("Failed to add book!")).toBeInTheDocument();
        expect(field("Title")).toHaveValue("Dune");
    });

    it("keeps what was typed when the network fails", async () => {
        fetchMock.mockRejectedValue(new TypeError("offline"));
        render(<NewBookForm />);
        await fill(valid);
        await submit();
        expect(await screen.findByText("Failed to add book!")).toBeInTheDocument();
        expect(field("Authors")).toHaveValue("Frank Herbert");
    });

    it("blocks the page and disables the button while saving, and sends only once", async () => {
        let finish!: (r: Response) => void;
        fetchMock.mockReturnValue(new Promise<Response>(r => { finish = r; }));
        render(<NewBookForm />);
        await fill(valid);
        await submit();
        expect(screen.getByText("Please wait while we process your request.")).toBeInTheDocument();
        const button = screen.getByRole("button", { name: "Adding..." });
        expect(button).toBeDisabled();
        fireSubmit();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await act(async () => { finish(json({})); });
        expect(screen.queryByText("Please wait while we process your request.")).not.toBeInTheDocument();
    });

    it("can add a second book straight after the first", async () => {
        fetchMock.mockResolvedValue(json({}));
        render(<NewBookForm />);
        await fill(valid);
        await submit();
        await screen.findByText("Successfully added book!");
        await fill({ ...valid, Title: "Emma" });
        await submit();
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        expect(JSON.parse(fetchMock.mock.calls[1][1].body).title).toBe("Emma");
    });
});

const fireSubmit = () => {
    const form = document.querySelector("form")!;
    act(() => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
};

describe("NewBookForm: scan ISBN to fill the form", () => {
    const scanIsbn = async (code = "9780441172719") => {
        fakeScan.code = code;
        await userEvent.click(screen.getByRole("button", { name: /scan isbn/i }));
        await userEvent.click(screen.getByText("fake scan ok"));
    };

    it("opens the scanner, and cancel closes it", async () => {
        render(<NewBookForm />);
        await userEvent.click(screen.getByRole("button", { name: /scan isbn/i }));
        expect(screen.getByTestId("scanner")).toBeInTheDocument();
        await userEvent.click(screen.getByText("fake scan cancel"));
        expect(screen.queryByTestId("scanner")).not.toBeInTheDocument();
    });

    it("a camera error closes it quietly", async () => {
        render(<NewBookForm />);
        await userEvent.click(screen.getByRole("button", { name: /scan isbn/i }));
        await userEvent.click(screen.getByText("fake scan error"));
        expect(screen.queryByTestId("scanner")).not.toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("looks the code up and fills the form", async () => {
        fetchMock.mockResolvedValue(json({ id: -1, title: "Dune", authors: "Frank Herbert", isbn10: "0441172717", isbn13: "9780441172719" }));
        render(<NewBookForm />);
        await scanIsbn("978 0441172719");
        expect(fetchMock).toHaveBeenCalledWith("/api/book?barcode=978%200441172719");
        await waitFor(() => expect(field("Title")).toHaveValue("Dune"));
        expect(field("Authors")).toHaveValue("Frank Herbert");
        expect(field("ISBN 10")).toHaveValue("0441172717");
        expect(field("ISBN 13")).toHaveValue("9780441172719");
        expect(screen.queryByTestId("scanner")).not.toBeInTheDocument();
    });

    it("fills missing ISBNs with empty text, not 'null' or 'undefined'", async () => {
        fetchMock.mockResolvedValue(json({ title: "T1", authors: "A1" }));
        render(<NewBookForm />);
        await scanIsbn();
        await waitFor(() => expect(field("Title")).toHaveValue("T1"));
        expect(field("ISBN 10")).toHaveValue("");
        expect(field("ISBN 13")).toHaveValue("");
    });

    it("clears earlier error messages when it fills the form", async () => {
        fetchMock.mockResolvedValue(json({ title: "Dune", authors: "FH", isbn13: "9780441172719" }));
        render(<NewBookForm />);
        await submit();
        expect(screen.getByText("Enter a title")).toBeInTheDocument();
        await scanIsbn();
        await waitFor(() => expect(screen.queryByText("Enter a title")).not.toBeInTheDocument());
    });

    it("says so when the book is not found, and leaves the form alone", async () => {
        fetchMock.mockResolvedValue(json({ message: "Book not found" }, 404));
        render(<NewBookForm />);
        await fill({ Title: "Typed" });
        await scanIsbn();
        expect(await screen.findByText("Book not found. Please check the ISBN or add it manually.")).toBeInTheDocument();
        expect(field("Title")).toHaveValue("Typed");
    });

    it("says the same when the lookup fails to connect", async () => {
        fetchMock.mockRejectedValue(new TypeError("offline"));
        render(<NewBookForm />);
        await scanIsbn();
        expect(await screen.findByText("Book not found. Please check the ISBN or add it manually.")).toBeInTheDocument();
    });

    it("shows the loader while looking up", async () => {
        let finish!: (r: Response) => void;
        fetchMock.mockReturnValue(new Promise<Response>(r => { finish = r; }));
        render(<NewBookForm />);
        await scanIsbn();
        expect(screen.getByText("Please wait while we process your request.")).toBeInTheDocument();
        await act(async () => { finish(json({ title: "T", authors: "A" })); });
        expect(screen.queryByText("Please wait while we process your request.")).not.toBeInTheDocument();
    });
});

describe("NewBookForm: copies", () => {
    it("scanning a copy adds it to the list", async () => {
        render(<NewBookForm />);
        await scanCopy("copy-1");
        const list = screen.getByRole("list", { name: "Copies to add" });
        expect(within(list).getByText("copy-1")).toBeInTheDocument();
        expect(screen.queryByText(/No copies yet/)).not.toBeInTheDocument();
        expect(screen.queryByTestId("scanner")).not.toBeInTheDocument();
    });

    it("scanning the same copy twice adds it once", async () => {
        render(<NewBookForm />);
        await scanCopy("copy-1");
        await scanCopy("copy-1");
        expect(screen.getAllByText("copy-1")).toHaveLength(1);
    });

    it("keeps several copies in the order they were scanned", async () => {
        render(<NewBookForm />);
        for (const c of ["b", "a", "c"]) await scanCopy(c);
        expect(within(screen.getByRole("list", { name: "Copies to add" })).getAllByRole("listitem").map(li => li.textContent)).toEqual(["b", "a", "c"]);
    });

    it("a copy can be removed again", async () => {
        render(<NewBookForm />);
        await scanCopy("copy-1");
        await scanCopy("copy-2");
        await userEvent.click(screen.getByRole("button", { name: "Remove copy copy-1" }));
        expect(screen.queryByText("copy-1")).not.toBeInTheDocument();
        expect(screen.getByText("copy-2")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Remove copy copy-2" }));
        expect(screen.getByText(/No copies yet/)).toBeInTheDocument();
    });

    it("sends the copies with the book", async () => {
        fetchMock.mockResolvedValue(json({}));
        render(<NewBookForm />);
        await fill(valid);
        await scanCopy("copy-1");
        await scanCopy("copy-2");
        await submit();
        expect(sentBody().copies).toEqual(["copy-1", "copy-2"]);
    });

    it("keeps the copies when saving fails, so nothing has to be scanned again", async () => {
        fetchMock.mockResolvedValue(json({}, 500));
        render(<NewBookForm />);
        await fill(valid);
        await scanCopy("copy-1");
        await submit();
        await screen.findByText("Failed to add book!");
        expect(screen.getByText("copy-1")).toBeInTheDocument();
    });
});
