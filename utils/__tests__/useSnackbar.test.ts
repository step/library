import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSnackbar } from "../useSnackbar";

describe("useSnackbar", () => {
    it("starts closed with no message", () => {
        const { result } = renderHook(() => useSnackbar());
        expect(result.current.snackbar).toEqual({ isOpen: false, message: "", type: "success" });
    });

    it("showSuccess opens a success message", () => {
        const { result } = renderHook(() => useSnackbar());
        act(() => result.current.showSuccess("Saved"));
        expect(result.current.snackbar).toEqual({ isOpen: true, message: "Saved", type: "success" });
    });

    it("showError opens an error message", () => {
        const { result } = renderHook(() => useSnackbar());
        act(() => result.current.showError("Nope"));
        expect(result.current.snackbar).toEqual({ isOpen: true, message: "Nope", type: "error" });
    });

    it("close hides it but keeps the text, so it can fade out", () => {
        const { result } = renderHook(() => useSnackbar());
        act(() => result.current.showError("Nope"));
        act(() => result.current.close());
        expect(result.current.snackbar).toEqual({ isOpen: false, message: "Nope", type: "error" });
    });

    it("a later message replaces the earlier one and its type", () => {
        const { result } = renderHook(() => useSnackbar());
        act(() => result.current.showError("Bad"));
        act(() => result.current.showSuccess("Good"));
        expect(result.current.snackbar).toEqual({ isOpen: true, message: "Good", type: "success" });
    });

    it("can reopen the same message after closing", () => {
        const { result } = renderHook(() => useSnackbar());
        act(() => result.current.showSuccess("Hi"));
        act(() => result.current.close());
        act(() => result.current.showSuccess("Hi"));
        expect(result.current.snackbar.isOpen).toBe(true);
    });

    it("close on an already closed snackbar changes nothing", () => {
        const { result } = renderHook(() => useSnackbar());
        act(() => result.current.close());
        expect(result.current.snackbar).toEqual({ isOpen: false, message: "", type: "success" });
    });

    it("keeps the same callbacks across renders (safe in effect dependencies)", () => {
        const { result, rerender } = renderHook(() => useSnackbar());
        const first = { s: result.current.showSuccess, e: result.current.showError, c: result.current.close };
        act(() => result.current.showSuccess("x"));
        rerender();
        expect(result.current.showSuccess).toBe(first.s);
        expect(result.current.showError).toBe(first.e);
        expect(result.current.close).toBe(first.c);
    });
});
