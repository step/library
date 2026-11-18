import { RefObject, useEffect, useRef } from "react";

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside a modal while it is open. Esc calls onEscape. Focus moves into the
 * container (to `initialFocus` if given) on open and back to whatever had it before on close.
 */
export const useFocusTrap = (
    container: RefObject<HTMLElement | null>,
    onEscape: () => void,
    initialFocus?: RefObject<HTMLElement | null>,
) => {
    // The latest handler, without re-running the effect (which would move focus again).
    const escape = useRef(onEscape);
    useEffect(() => {
        escape.current = onEscape;
    }, [onEscape]);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        (initialFocus?.current ?? container.current)?.focus();

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.preventDefault();
                escape.current();
                return;
            }
            if (e.key !== "Tab" || !container.current) return;
            // Skip tabindex=-1 (e.g. the unchecked stars of a radio group, reached with arrow keys).
            const items = Array.from(container.current.querySelectorAll<HTMLElement>(FOCUSABLE))
                .filter(el => el.getAttribute("tabindex") !== "-1");
            if (items.length === 0) return;
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (e.shiftKey && (active === first || active === container.current)) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
            previous?.focus?.();
        };
    }, [container, initialFocus]);
};
