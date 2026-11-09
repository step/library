import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Nothing in the suite may reach the network. Tests that need fetch must stub it themselves.
beforeAll(() => {
    vi.stubGlobal("fetch", (input: unknown) => {
        throw new Error(`Unmocked network call in test: ${String(input)}`);
    });
});

afterEach(() => cleanup());
