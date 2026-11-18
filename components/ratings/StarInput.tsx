"use client";
import { KeyboardEvent, useRef } from "react";
import { Star } from "lucide-react";
import { MAX_RATING, starsLabel } from "../../utils/ratings";
import "../../styles/Ratings.css";

type Props = {
    /** 0 when no star is chosen. */
    value: number;
    onChange: (value: number) => void;
    /** id of the element that names the group. */
    labelledBy: string;
    size?: "md" | "lg";
    disabled?: boolean;
};

const range = Array.from({ length: MAX_RATING }, (_, i) => i + 1);

/**
 * Five stars that behave as a radio group: Tab reaches the chosen star (or the first),
 * arrow keys, Home and End move the choice, click or Space picks a star.
 */
const StarInput = ({ value, onChange, labelledBy, size = "md", disabled = false }: Props) => {
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const iconSize = size === "lg" ? 40 : 36;

    const pick = (n: number) => {
        onChange(n);
        buttons.current[n - 1]?.focus();
    };

    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        const current = value || 0;
        let next: number | undefined;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") next = current >= MAX_RATING ? 1 : current + 1;
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = current <= 1 ? MAX_RATING : current - 1;
        else if (e.key === "Home") next = 1;
        else if (e.key === "End") next = MAX_RATING;
        if (next === undefined) return;
        e.preventDefault();
        pick(next);
    };

    return (
        <div
            className={`rt-star-input${size === "lg" ? " rt-star-input-lg" : ""}`}
            role="radiogroup"
            aria-labelledby={labelledBy}
            onKeyDown={disabled ? undefined : onKeyDown}
        >
            {range.map(n => {
                const checked = n === value;
                const tabbable = checked || (value === 0 && n === 1);
                return (
                    <button
                        key={n}
                        ref={el => { buttons.current[n - 1] = el; }}
                        type="button"
                        className="rt-star-btn"
                        role="radio"
                        aria-checked={checked}
                        aria-label={starsLabel(n)}
                        tabIndex={tabbable ? 0 : -1}
                        disabled={disabled}
                        onClick={() => pick(n)}
                    >
                        <Star size={iconSize} strokeWidth={1.75} className={`rt-star${n <= value ? " is-on" : ""}`} aria-hidden="true" />
                    </button>
                );
            })}
        </div>
    );
};

export default StarInput;
