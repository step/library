import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FakeBarcodeScanner, lastScannerProps, resetScanner } from "../../test/helpers/fakes";

vi.mock("next/dynamic", () => ({ default: () => FakeBarcodeScanner }));

const api = vi.hoisted(() => ({ borrowBook: vi.fn(), returnBook: vi.fn() }));
vi.mock("@/app/BooksApi", () => api);
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import Scanner from "../Scanner";
import BorrowBook from "../../src/app/BorrowBook";
import ReturnBook from "../../src/app/reading/ReturnBook";

beforeEach(() => {
    vi.clearAllMocks();
    resetScanner();
    vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Scanner", () => {
    const setup = (props = {}) => {
        const onScanResult = vi.fn();
        const onScanError = vi.fn();
        const utils = render(<Scanner onScanResult={onScanResult} onScanError={onScanError} {...props} />);
        return { onScanResult, onScanError, ...utils };
    };

    it("starts closed", () => {
        setup();
        expect(screen.queryByTestId("scanner")).not.toBeInTheDocument();
    });

    it("the compact button opens the scanner", async () => {
        setup({ title: "Scan book" });
        await userEvent.click(screen.getByRole("button", { name: "Scan book" }));
        expect(screen.getByTestId("scanner")).toBeInTheDocument();
    });

    it("the floating button opens it too, with an accessible name", async () => {
        setup({ fab: true });
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        expect(screen.getByTestId("scanner")).toBeInTheDocument();
    });

    it("hands over the scanned code and closes", async () => {
        const { onScanResult } = setup({ fab: true });
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        await userEvent.click(screen.getByText("fake scan ok"));
        expect(onScanResult).toHaveBeenCalledWith("qr-1");
        expect(screen.queryByTestId("scanner")).not.toBeInTheDocument();
    });

    it("reports a camera error with a friendly message and closes", async () => {
        const { onScanError, onScanResult } = setup({ fab: true });
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        await userEvent.click(screen.getByText("fake scan error"));
        expect(onScanError).toHaveBeenCalledWith("Failed to scan barcode. Please try again.");
        expect(onScanResult).not.toHaveBeenCalled();
        expect(screen.queryByTestId("scanner")).not.toBeInTheDocument();
    });

    it("cancel closes without reporting anything", async () => {
        const { onScanResult, onScanError } = setup({ fab: true });
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        await userEvent.click(screen.getByText("fake scan cancel"));
        expect(screen.queryByTestId("scanner")).not.toBeInTheDocument();
        expect(onScanResult).not.toHaveBeenCalled();
        expect(onScanError).not.toHaveBeenCalled();
    });

    it("ignores repeat detections of the same code (a live camera reports a QR many times per second)", async () => {
        const { onScanResult } = setup({ fab: true });
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        const { onResult } = lastScannerProps();
        act(() => { onResult("qr-1"); onResult("qr-1"); onResult("qr-1"); });
        expect(onScanResult).toHaveBeenCalledTimes(1);
    });

    it("a late detection after an error cannot reopen the scanner or report twice", async () => {
        const { onScanResult } = setup({ fab: true });
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        const { onResult, onError } = lastScannerProps();
        act(() => { onError(new Error("x")); onResult("late"); });
        expect(onScanResult).not.toHaveBeenCalled();
        expect(screen.queryByTestId("scanner")).not.toBeInTheDocument();
    });

    it("ignores a duplicate that arrives after the scanner has already closed", async () => {
        const { onScanResult, onScanError } = setup({ fab: true });
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        const { onResult, onError } = lastScannerProps();
        act(() => { onResult("qr-1"); });
        expect(screen.queryByTestId("scanner")).not.toBeInTheDocument();
        act(() => { onResult("qr-1"); onError(new Error("late")); });
        expect(onScanResult).toHaveBeenCalledTimes(1);
        expect(onScanError).not.toHaveBeenCalled();
        expect(screen.queryByTestId("scanner")).not.toBeInTheDocument();
    });

    it("works again on the next opening", async () => {
        const { onScanResult } = setup({ fab: true });
        for (let i = 0; i < 3; i++) {
            await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
            await userEvent.click(screen.getByText("fake scan ok"));
        }
        expect(onScanResult).toHaveBeenCalledTimes(3);
    });
});

describe("BorrowBook", () => {
    const scan = async () => {
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        await userEvent.click(screen.getByText("fake scan ok"));
    };

    it("borrows the scanned code and shows a success message", async () => {
        api.borrowBook.mockResolvedValue({ success: true, data: {} });
        render(<BorrowBook />);
        await scan();
        expect(api.borrowBook).toHaveBeenCalledWith("qr-1");
        expect(await screen.findByRole("status")).toHaveTextContent("Book borrowed successfully");
    });

    it("shows the server's reason when borrowing fails", async () => {
        api.borrowBook.mockResolvedValue({ success: false, data: { message: "Book copy is already borrowed" } });
        render(<BorrowBook />);
        await scan();
        expect(await screen.findByRole("alert")).toHaveTextContent("Book copy is already borrowed");
    });

    it("blocks the page with a loader while the request runs, then removes it", async () => {
        let finish!: (v: unknown) => void;
        api.borrowBook.mockReturnValue(new Promise(r => { finish = r; }));
        render(<BorrowBook />);
        await scan();
        expect(screen.getByText("Please wait while we process your request...")).toBeInTheDocument();
        await act(async () => { finish({ success: true, data: {} }); });
        expect(screen.queryByText("Please wait while we process your request...")).not.toBeInTheDocument();
    });

    it("tells the user when the camera fails", async () => {
        render(<BorrowBook />);
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        await userEvent.click(screen.getByText("fake scan error"));
        expect(await screen.findByRole("alert")).toHaveTextContent("Scan error: Failed to scan barcode. Please try again.");
        expect(api.borrowBook).not.toHaveBeenCalled();
    });

    it("borrows once even if the scanner reports the code twice", async () => {
        api.borrowBook.mockResolvedValue({ success: true, data: {} });
        render(<BorrowBook />);
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        const { onResult } = lastScannerProps();
        await act(async () => { onResult("qr-1"); onResult("qr-1"); });
        expect(api.borrowBook).toHaveBeenCalledTimes(1);
    });
});

describe("messages disappear on their own after 4 seconds", () => {
    it.each([
        ["BorrowBook", BorrowBook, () => api.borrowBook, "Book borrowed successfully"],
        ["ReturnBook", ReturnBook, () => api.returnBook, "Book returned successfully"],
    ])("%s", async (_n, Component, fn, text) => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            fn().mockResolvedValue({ success: true, data: {} });
            render(<Component />);
            await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
            await userEvent.click(screen.getByText("fake scan ok"));
            expect(await screen.findByText(text)).toBeInTheDocument();
            act(() => { vi.advanceTimersByTime(3900); });
            expect(screen.getByText(text)).toBeInTheDocument();
            act(() => { vi.advanceTimersByTime(200); });
            expect(screen.queryByText(text)).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("ReturnBook", () => {
    it("blocks the page with a loader while the request runs, then removes it", async () => {
        let finish!: (v: unknown) => void;
        api.returnBook.mockReturnValue(new Promise(r => { finish = r; }));
        render(<ReturnBook />);
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        await userEvent.click(screen.getByText("fake scan ok"));
        expect(screen.getByText("Please wait while we process your request...")).toBeInTheDocument();
        await act(async () => { finish({ success: true, data: {} }); });
        expect(screen.queryByText("Please wait while we process your request...")).not.toBeInTheDocument();
    });
});

describe("ReturnBook flows", () => {
    const scan = async () => {
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        await userEvent.click(screen.getByText("fake scan ok"));
    };

    it("returns the scanned code, confirms, and refreshes the list", async () => {
        api.returnBook.mockResolvedValue({ success: true, data: {} });
        render(<ReturnBook />);
        await scan();
        expect(api.returnBook).toHaveBeenCalledWith("qr-1");
        expect(await screen.findByRole("status")).toHaveTextContent("Book returned successfully");
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("shows the reason and does not refresh when returning fails", async () => {
        api.returnBook.mockResolvedValue({ success: false, data: { message: "You have not borrowed this book" } });
        render(<ReturnBook />);
        await scan();
        expect(await screen.findByRole("alert")).toHaveTextContent("Failed to return book: You have not borrowed this book");
        expect(refresh).not.toHaveBeenCalled();
    });

    it("tells the user when the camera fails", async () => {
        render(<ReturnBook />);
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        await userEvent.click(screen.getByText("fake scan error"));
        expect(await screen.findByRole("alert")).toHaveTextContent("Failed to scan QR code. Please try again.");
        expect(api.returnBook).not.toHaveBeenCalled();
    });

    it("returns once even if the scanner reports the code twice", async () => {
        api.returnBook.mockResolvedValue({ success: true, data: {} });
        render(<ReturnBook />);
        await userEvent.click(screen.getByRole("button", { name: "Scan QR code" }));
        const { onResult } = lastScannerProps();
        await act(async () => { onResult("qr-1"); onResult("qr-1"); });
        expect(api.returnBook).toHaveBeenCalledTimes(1);
    });
});
