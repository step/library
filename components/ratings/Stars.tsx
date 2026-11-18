import { Star } from "lucide-react";
import { MAX_RATING } from "../../utils/ratings";
import "../../styles/Ratings.css";

const range = Array.from({ length: MAX_RATING }, (_, i) => i + 1);

/** Read-only row of stars, announced as "Rated N out of 5". */
const Stars = ({ value, size = 18 }: { value: number; size?: number }) => (
    <span className="rt-stars" role="img" aria-label={`Rated ${value} out of ${MAX_RATING}`}>
        {range.map(n => (
            <Star key={n} size={size} strokeWidth={2} className={`rt-star${n <= value ? " is-on" : ""}`} aria-hidden="true" />
        ))}
    </span>
);

export default Stars;
