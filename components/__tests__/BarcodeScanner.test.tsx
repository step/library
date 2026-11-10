import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const lib = vi.hoisted(() => ({ props: null as null | Record<string, (...a: unknown[]) => void> & { formats?: string[] } }));
vi.mock("@yudiel/react-qr-scanner", () => ({
    Scanner: (props: Record<string, never>) => { lib.props = props; return <div data-testid="camera" />; },
}));

import BarcodeScanner from "../BarcodeScanner";

const setup = (opened = true) => {
    const handlers = { onResult: vi.fn(), onError: vi.fn(), onCancel: vi.fn() };
    render(<BarcodeScanner opened={opened} {...handlers} />);
    return handlers;
};

describe("BarcodeScanner", () => {
    it("renders nothing, and starts no camera, while closed", () => {
        lib.props = null;
        setup(false);
        expect(screen.queryByTestId("camera")).not.toBeInTheDocument();
        expect(lib.props).toBeNull();
    });

    it("shows the camera with a cancel button when open", () => {
        setup();
        expect(screen.getByTestId("camera")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel scan" })).toBeInTheDocument();
    });

    it("reads QR codes and EAN-13 barcodes only", () => {
        setup();
        expect(lib.props!.formats).toEqual(["ean_13", "qr_code"]);
    });

    it("cancel calls onCancel", async () => {
        const { onCancel } = setup();
        await userEvent.click(screen.getByRole("button", { name: "Cancel scan" }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("passes the first detected value to onResult", () => {
        const { onResult } = setup();
        lib.props!.onScan([{ rawValue: "9780441172719" }, { rawValue: "other" }]);
        expect(onResult).toHaveBeenCalledWith("9780441172719");
    });

    it("ignores a detection with no results instead of crashing", () => {
        const { onResult } = setup();
        expect(() => lib.props!.onScan([])).not.toThrow();
        expect(onResult).not.toHaveBeenCalled();
    });

    it("ignores a detection whose value is empty", () => {
        const { onResult } = setup();
        lib.props!.onScan([{ rawValue: "" }]);
        expect(onResult).not.toHaveBeenCalled();
    });

    it("forwards camera errors", () => {
        const { onError } = setup();
        const err = new Error("NotAllowedError");
        lib.props!.onError(err);
        expect(onError).toHaveBeenCalledWith(err);
    });
});
