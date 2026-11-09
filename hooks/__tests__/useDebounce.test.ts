import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "../useDebounce";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe("useDebounce", () => {
    it("returns the initial value immediately", () => {
        const { result } = renderHook(() => useDebounce("a", 300));
        expect(result.current).toBe("a");
    });

    it("updates only once the delay has fully passed", () => {
        const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), { initialProps: { v: "a" } });
        rerender({ v: "b" });
        advance(299);
        expect(result.current).toBe("a");
        advance(1);
        expect(result.current).toBe("b");
    });

    it("restarts the timer on every change and emits only the last value", () => {
        const { result, rerender } = renderHook(({ v }) => useDebounce(v, 300), { initialProps: { v: "" } });
        for (const v of ["h", "he", "hel", "hell", "hello"]) {
            rerender({ v });
            advance(200);
            expect(result.current).toBe("");
        }
        advance(100);
        expect(result.current).toBe("hello");
    });

    it("never emits intermediate values", () => {
        const seen: string[] = [];
        const { rerender } = renderHook(({ v }) => { const d = useDebounce(v, 100); seen.push(d); return d; }, { initialProps: { v: "a" } });
        rerender({ v: "b" }); advance(50);
        rerender({ v: "c" }); advance(100);
        expect(seen).not.toContain("b");
        expect(seen).toContain("c");
    });

    it("restarts the timer when the delay changes", () => {
        const { result, rerender } = renderHook(({ v, d }) => useDebounce(v, d), { initialProps: { v: "a", d: 300 } });
        rerender({ v: "b", d: 300 });
        advance(200);
        rerender({ v: "b", d: 500 });
        advance(499);
        expect(result.current).toBe("a");
        advance(1);
        expect(result.current).toBe("b");
    });

    it("applies a zero delay on the next tick", () => {
        const { result, rerender } = renderHook(({ v }) => useDebounce(v, 0), { initialProps: { v: 1 } });
        rerender({ v: 2 });
        advance(0);
        expect(result.current).toBe(2);
    });

    it("clears its timer on unmount", () => {
        const { unmount, rerender } = renderHook(({ v }) => useDebounce(v, 300), { initialProps: { v: "a" } });
        rerender({ v: "b" });
        expect(vi.getTimerCount()).toBe(1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it("works for objects, null and undefined", () => {
        const obj = { x: 1 };
        const { result, rerender } = renderHook(({ v }) => useDebounce<unknown>(v, 10), { initialProps: { v: null as unknown } });
        expect(result.current).toBeNull();
        rerender({ v: obj }); advance(10);
        expect(result.current).toBe(obj);
        rerender({ v: undefined }); advance(10);
        expect(result.current).toBeUndefined();
    });
});
