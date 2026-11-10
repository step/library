import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const qr = vi.hoisted(() => ({ buildCode: vi.fn(async (id: string) => ({ id, d: "M0 0h1v1h-1z", size: 21 })) }));
vi.mock("../qr", () => qr);

import QrSheet from "../QrSheet";

const count = () => screen.getByLabelText("Number of QR codes") as HTMLInputElement;
const generate = () => userEvent.click(screen.getByRole("button", { name: "Generate" }));
const codes = () => screen.queryAllByRole("img", { name: /^QR code \d+$/ });

beforeEach(() => {
    vi.clearAllMocks();
    qr.buildCode.mockImplementation(async (id: string) => ({ id, d: "M0 0h1v1h-1z", size: 21 }));
    vi.spyOn(window, "print").mockImplementation(() => {});
});

describe("QrSheet", () => {
    it("starts with 12, no codes and a disabled print button", () => {
        render(<QrSheet />);
        expect(count()).toHaveValue("12");
        expect(codes()).toHaveLength(0);
        expect(screen.getByText("No codes yet")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /print sheet/i })).toBeDisabled();
    });

    it("makes the number of codes asked for, each different", async () => {
        render(<QrSheet />);
        await userEvent.clear(count());
        await userEvent.type(count(), "5");
        await generate();
        await waitFor(() => expect(codes()).toHaveLength(5));
        const ids = qr.buildCode.mock.calls.map(c => c[0]);
        expect(new Set(ids).size).toBe(5);
        expect(screen.getByRole("heading", { name: "5 QR codes" })).toBeInTheDocument();
    });

    it("says '1 QR code' for one", async () => {
        render(<QrSheet />);
        await userEvent.clear(count());
        await userEvent.type(count(), "1");
        await generate();
        expect(await screen.findByRole("heading", { name: "1 QR code" })).toBeInTheDocument();
    });

    it("each id is a time stamp plus a random part, so no two sheets ever collide", async () => {
        render(<QrSheet />);
        await generate();
        await waitFor(() => expect(codes()).toHaveLength(12));
        for (const [id] of qr.buildCode.mock.calls) expect(id).toMatch(/^\d{13}-[0-9a-f-]{36}$/);
    });

    it("prints nothing but the codes: no text under them", async () => {
        render(<QrSheet />);
        await generate();
        await waitFor(() => expect(codes()).toHaveLength(12));
        const sheet = document.querySelector(".mg-qr-grid")!;
        expect(sheet.textContent).toBe("");
        for (const li of sheet.querySelectorAll("li")) expect(li.querySelector("svg")).toBeInTheDocument();
    });

    it("a second Generate replaces the first set", async () => {
        render(<QrSheet />);
        await userEvent.clear(count());
        await userEvent.type(count(), "3");
        await generate();
        await waitFor(() => expect(codes()).toHaveLength(3));
        const first = qr.buildCode.mock.calls.map(c => c[0]);
        await userEvent.clear(count());
        await userEvent.type(count(), "2");
        await generate();
        await waitFor(() => expect(codes()).toHaveLength(2));
        const second = qr.buildCode.mock.calls.slice(3).map(c => c[0]);
        expect(second.some(id => first.includes(id))).toBe(false);
    });

    it("shows 'Generating...' until the codes are ready", async () => {
        let finish!: () => void;
        qr.buildCode.mockImplementation(id => new Promise(r => { finish = () => r({ id, d: "", size: 21 }); }));
        render(<QrSheet />);
        await userEvent.clear(count());
        await userEvent.type(count(), "1");
        await generate();
        expect(screen.getByRole("heading", { name: "Generating..." })).toBeInTheDocument();
        expect(screen.getByText("Generating your codes...")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /print sheet/i })).toBeDisabled();
        await act(async () => { finish(); });
        expect(await screen.findByRole("heading", { name: "1 QR code" })).toBeInTheDocument();
    });

    it("does not crash if the page is closed while codes are being made", async () => {
        let finish!: () => void;
        qr.buildCode.mockImplementation(id => new Promise(r => { finish = () => r({ id, d: "", size: 21 }); }));
        const error = vi.spyOn(console, "error").mockImplementation(() => {});
        const { unmount } = render(<QrSheet />);
        await generate();
        unmount();
        await act(async () => { finish(); });
        expect(error).not.toHaveBeenCalled();
    });

    describe("the number", () => {
        it.each([["0"], ["-1"], ["1.5"], ["abc"], [""], ["  "], ["1e1"]])("rejects %j", async (text) => {
            render(<QrSheet />);
            await userEvent.clear(count());
            if (text) await userEvent.type(count(), text);
            await generate();
            expect(screen.getByText("Please enter a valid number of QR codes.")).toBeInTheDocument();
            expect(qr.buildCode).not.toHaveBeenCalled();
            expect(count()).toHaveAttribute("aria-invalid", "true");
        });

        it("rejects more than 200", async () => {
            render(<QrSheet />);
            await userEvent.clear(count());
            await userEvent.type(count(), "201");
            await generate();
            expect(screen.getByText("You can generate up to 200 codes at a time.")).toBeInTheDocument();
            expect(qr.buildCode).not.toHaveBeenCalled();
        });

        it("accepts exactly 200", async () => {
            render(<QrSheet />);
            await userEvent.clear(count());
            await userEvent.type(count(), "200");
            await generate();
            await waitFor(() => expect(codes()).toHaveLength(200));
        });

        it("the error goes away when the number is edited", async () => {
            render(<QrSheet />);
            await userEvent.clear(count());
            await generate();
            expect(screen.getByText("Please enter a valid number of QR codes.")).toBeInTheDocument();
            await userEvent.type(count(), "3");
            expect(screen.queryByText("Please enter a valid number of QR codes.")).not.toBeInTheDocument();
        });

        it("a failed attempt leaves the previous codes alone", async () => {
            render(<QrSheet />);
            await userEvent.clear(count());
            await userEvent.type(count(), "2");
            await generate();
            await waitFor(() => expect(codes()).toHaveLength(2));
            await userEvent.clear(count());
            await userEvent.type(count(), "0");
            await generate();
            expect(codes()).toHaveLength(2);
        });
    });

    describe("the steppers", () => {
        const more = () => userEvent.click(screen.getByRole("button", { name: "More codes" }));
        const fewer = () => userEvent.click(screen.getByRole("button", { name: "Fewer codes" }));

        it("add and remove one", async () => {
            render(<QrSheet />);
            await more();
            expect(count()).toHaveValue("13");
            await fewer(); await fewer();
            expect(count()).toHaveValue("11");
        });
        it("stop at 1", async () => {
            render(<QrSheet />);
            await userEvent.clear(count());
            await userEvent.type(count(), "1");
            await fewer();
            expect(count()).toHaveValue("1");
        });
        it("stop at 200", async () => {
            render(<QrSheet />);
            await userEvent.clear(count());
            await userEvent.type(count(), "200");
            await more();
            expect(count()).toHaveValue("200");
        });
        it("treat junk as 0, so More gives 1 and Fewer gives 1", async () => {
            render(<QrSheet />);
            await userEvent.clear(count());
            await userEvent.type(count(), "abc");
            await more();
            expect(count()).toHaveValue("1");
            await userEvent.clear(count());
            await fewer();
            expect(count()).toHaveValue("1");
        });
        it("clear an error message", async () => {
            render(<QrSheet />);
            await userEvent.clear(count());
            await generate();
            await more();
            expect(screen.queryByText("Please enter a valid number of QR codes.")).not.toBeInTheDocument();
        });
    });

    it("the print button prints once there are codes", async () => {
        render(<QrSheet />);
        await generate();
        await waitFor(() => expect(codes()).toHaveLength(12));
        const print = screen.getByRole("button", { name: /print sheet/i });
        expect(print).toBeEnabled();
        await userEvent.click(print);
        expect(window.print).toHaveBeenCalledTimes(1);
    });

    it("submitting with Enter works like the button", async () => {
        render(<QrSheet />);
        await userEvent.type(count(), "{Enter}");
        await waitFor(() => expect(codes().length).toBeGreaterThan(0));
    });
});
