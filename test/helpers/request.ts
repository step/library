import { NextRequest } from "next/server";

type Options = { method?: string; body?: unknown; rawBody?: string };

/** Builds a NextRequest for calling a route handler directly. */
export const makeRequest = (url: string, { method = "GET", body, rawBody }: Options = {}) =>
    new NextRequest(new URL(url, "http://localhost:3000"), {
        method,
        ...(rawBody !== undefined
            ? { body: rawBody, headers: { "Content-Type": "application/json" } }
            : body !== undefined
                ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }
                : {}),
    });

export const params = (id: string) => ({ params: Promise.resolve({ id }) });
