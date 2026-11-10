import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Testing Library only advances fake timers for its own waits when a global `jest` exists.
// Without this shim every userEvent / findBy call hangs under vi.useFakeTimers().
(globalThis as unknown as { jest: unknown }).jest = { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) };

// Nothing in the suite may reach the network. Tests that need fetch must stub it themselves.
beforeAll(() => {
    vi.stubGlobal("fetch", (input: unknown) => {
        throw new Error(`Unmocked network call in test: ${String(input)}`);
    });
});

afterEach(() => cleanup());
