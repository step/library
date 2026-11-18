/** Star ratings: whole stars from 1 to 5. Shared by the API (validation) and the UI (labels). */
export const MIN_RATING = 1;
export const MAX_RATING = 5;

export const RATING_LABELS: Record<number, string> = {
    1: "Not for me",
    2: "It was okay",
    3: "Good",
    4: "Really good",
    5: "Loved it",
};

export const isValidRating = (value: unknown): value is number =>
    typeof value === "number" && Number.isInteger(value) && value >= MIN_RATING && value <= MAX_RATING;

export const ratingLabel = (rating: number) => RATING_LABELS[rating] ?? "";

export const starsLabel = (n: number) => `${n} ${n === 1 ? "star" : "stars"}`;

export const readersLabel = (n: number) => `${n} ${n === 1 ? "reader" : "readers"}`;
