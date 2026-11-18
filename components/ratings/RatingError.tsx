import { AlertCircle } from "lucide-react";
import type { RatingFailure } from "../../src/app/BooksApi";
import "../../styles/Ratings.css";

const TITLE: Record<RatingFailure, string> = {
    offline: "You are offline",
    server: "Could not save your rating",
};

const DETAIL: Record<"return" | "dialog", Record<RatingFailure, string>> = {
    return: {
        offline: "Check your connection, then try again. Your book is still marked as returned.",
        server: "Something went wrong on our side. Your book is still marked as returned.",
    },
    dialog: {
        offline: "Check your connection, then try again. Your stars are still selected.",
        server: "Something went wrong on our side. Your stars are still selected, so you can try again.",
    },
};

/** Why saving a rating failed, shown under the stars. `context` picks the reassurance line. */
const RatingError = ({ reason, context }: { reason: RatingFailure; context: "return" | "dialog" }) => (
    <div className="rt-inline-err" role="alert">
        <AlertCircle size={18} aria-hidden="true" />
        <span><strong>{TITLE[reason]}</strong><br />{DETAIL[context][reason]}</span>
    </div>
);

export default RatingError;
