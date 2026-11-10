import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Snackbar from "../Snackbar";
import LoaderOverlay from "../LoaderOverlay";
import LoadingSpinner from "../LoadingSpinner";
import ConfirmDialog from "../manage/ConfirmDialog";
import FieldError from "../manage/FieldError";

describe("Snackbar", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    const base = { message: "Saved", type: "success" as const, isOpen: true, onClose: () => {} };

    it("renders nothing while closed", () => {
        const { container } = render(<Snackbar {...base} isOpen={false} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("announces a success politely (role=status) and an error assertively (role=alert)", () => {
        const { rerender } = render(<Snackbar {...base} />);
        expect(screen.getByRole("status")).toHaveTextContent("Saved");
        rerender(<Snackbar {...base} type="error" message="Oops" />);
        expect(screen.getByRole("alert")).toHaveTextContent("Oops");
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("closes from the dismiss button", () => {
        const onClose = vi.fn();
        render(<Snackbar {...base} onClose={onClose} />);
        act(() => screen.getByRole("button", { name: "Dismiss notification" }).click());
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes itself after 4 seconds by default, not before", () => {
        const onClose = vi.fn();
        render(<Snackbar {...base} onClose={onClose} />);
        act(() => { vi.advanceTimersByTime(3999); });
        expect(onClose).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(1); });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("honours a custom duration", () => {
        const onClose = vi.fn();
        render(<Snackbar {...base} onClose={onClose} duration={1000} />);
        act(() => { vi.advanceTimersByTime(1000); });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["autoClose is false", { autoClose: false }],
        ["duration is 0", { duration: 0 }],
        ["duration is negative", { duration: -5 }],
    ])("stays open forever when %s", (_n, props) => {
        const onClose = vi.fn();
        render(<Snackbar {...base} onClose={onClose} {...props} />);
        act(() => { vi.advanceTimersByTime(60_000); });
        expect(onClose).not.toHaveBeenCalled();
    });

    it("does not start a timer while closed, and cancels it when closed early", () => {
        const onClose = vi.fn();
        const { rerender, unmount } = render(<Snackbar {...base} onClose={onClose} isOpen={false} />);
        expect(vi.getTimerCount()).toBe(0);
        rerender(<Snackbar {...base} onClose={onClose} />);
        expect(vi.getTimerCount()).toBe(1);
        rerender(<Snackbar {...base} onClose={onClose} isOpen={false} />);
        expect(vi.getTimerCount()).toBe(0);
        rerender(<Snackbar {...base} onClose={onClose} />);
        unmount();
        act(() => { vi.advanceTimersByTime(10_000); });
        expect(onClose).not.toHaveBeenCalled();
    });

    it("hides decorative icons from screen readers", () => {
        const { container } = render(<Snackbar {...base} />);
        container.querySelectorAll("svg").forEach(svg => expect(svg).toHaveAttribute("aria-hidden", "true"));
    });
});

describe("LoaderOverlay", () => {
    it("blocks the page and tells assistive tech it is busy", () => {
        render(<LoaderOverlay title="Loading" message="Please wait" />);
        const alert = screen.getByRole("alert");
        expect(alert).toHaveAttribute("aria-busy", "true");
        expect(alert).toHaveTextContent("Loading");
        expect(alert).toHaveTextContent("Please wait");
    });
});

describe("LoadingSpinner", () => {
    it("defaults to medium with no message", () => {
        const { container } = render(<LoadingSpinner />);
        expect(container.querySelector(".loading-spinner-medium")).toBeInTheDocument();
        expect(container.querySelector(".loading-spinner-message")).not.toBeInTheDocument();
    });
    it.each(["small", "medium", "large"] as const)("renders size %s", (size) => {
        const { container } = render(<LoadingSpinner size={size} message="Wait" className="extra" />);
        expect(container.querySelector(`.loading-spinner-${size}`)).toBeInTheDocument();
        expect(screen.getByText("Wait")).toBeInTheDocument();
        expect(container.firstChild).toHaveClass("extra");
    });
});

describe("FieldError", () => {
    it("renders nothing without a message", () => {
        const { container, rerender } = render(<FieldError id="e" />);
        expect(container).toBeEmptyDOMElement();
        rerender(<FieldError id="e" message="" />);
        expect(container).toBeEmptyDOMElement();
    });
    it("shows the message with the id inputs point to via aria-describedby", () => {
        render(<FieldError id="e-name" message="Enter a name" />);
        const p = screen.getByText("Enter a name").closest("p")!;
        expect(p).toHaveAttribute("id", "e-name");
    });
});

describe("ConfirmDialog", () => {
    const setup = (over = {}) => {
        const props = { title: "Remove Ada?", description: "This cannot be undone.", confirmLabel: "Remove user", onConfirm: vi.fn(), onCancel: vi.fn(), ...over };
        const utils = render(<ConfirmDialog {...props} />);
        return { ...props, ...utils };
    };

    it("is an accessible alert dialog with title and description", () => {
        setup();
        const dialog = screen.getByRole("alertdialog", { name: "Remove Ada?" });
        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveAccessibleDescription("This cannot be undone.");
    });

    it("starts focus on Cancel (the safe choice)", () => {
        setup();
        expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    });

    it("calls the right callback for each button", async () => {
        const user = userEvent.setup();
        const { onConfirm, onCancel } = setup();
        await user.click(screen.getByRole("button", { name: "Remove user" }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onCancel).not.toHaveBeenCalled();
        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("Escape cancels without confirming", async () => {
        const user = userEvent.setup();
        const { onConfirm, onCancel } = setup();
        await user.keyboard("{Escape}");
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it("keeps Tab inside the dialog in both directions", async () => {
        const user = userEvent.setup();
        setup();
        const cancel = screen.getByRole("button", { name: "Cancel" });
        const confirm = screen.getByRole("button", { name: "Remove user" });
        await user.tab();
        expect(confirm).toHaveFocus();
        await user.tab();
        expect(cancel).toHaveFocus();
        await user.tab({ shift: true });
        expect(confirm).toHaveFocus();
    });

    it("gives focus back to what opened it, and stops listening for keys", async () => {
        const user = userEvent.setup();
        const opener = document.createElement("button");
        document.body.appendChild(opener);
        opener.focus();
        const onCancel = vi.fn();
        const { unmount } = render(<ConfirmDialog title="t" description="d" confirmLabel="Go" onConfirm={() => {}} onCancel={onCancel} />);
        expect(opener).not.toHaveFocus();
        unmount();
        expect(opener).toHaveFocus();
        await user.keyboard("{Escape}");
        expect(onCancel).not.toHaveBeenCalled();
        opener.remove();
    });
});
