import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVirtualScroll } from "../useVirtualScroll";

describe("useVirtualScroll", () => {
    it("starts at 0 by default", () => {
        const { result } = renderHook(() => useVirtualScroll());
        expect(result.current.lastScrollPosition).toBe(0);
    });
    it("starts at the given position", () => {
        const { result } = renderHook(() => useVirtualScroll({ initialScrollPosition: 250 }));
        expect(result.current.lastScrollPosition).toBe(250);
    });
    it("records scrollTop from the scroll event", () => {
        const { result } = renderHook(() => useVirtualScroll());
        act(() => result.current.handleScroll({ target: { scrollTop: 480 } }));
        expect(result.current.lastScrollPosition).toBe(480);
        act(() => result.current.handleScroll({ target: { scrollTop: 0 } }));
        expect(result.current.lastScrollPosition).toBe(0);
    });
    it("keeps a stable handler", () => {
        const { result, rerender } = renderHook(() => useVirtualScroll());
        const handler = result.current.handleScroll;
        act(() => result.current.handleScroll({ target: { scrollTop: 1 } }));
        rerender();
        expect(result.current.handleScroll).toBe(handler);
    });
});
