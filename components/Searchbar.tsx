import { useEffect, useRef } from "react";
import { Search, Loader2 } from "lucide-react";

const Searchbar = (props: {
    value: string;
    onChange: (s: string) => void;
    onSearch: () => void;
    isLoading?: boolean;
}) => {

    const inputRef = useRef<HTMLInputElement>(null);
    // The box is disabled while a search runs, and a disabled input loses focus: so someone typing
    // with a pause in the middle would be kicked out. Remember if they were in it and go back.
    const hadFocus = useRef(false);
    useEffect(() => {
        if (!props.isLoading && hadFocus.current) inputRef.current?.focus();
    }, [props.isLoading]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        props.onChange(e.target.value);
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            props.onSearch();
        }
    }

    return (
        <label className="bk-search">
            <span className="bk-sr">Search books</span>
            {props.isLoading ? (
                <Loader2 className="bk-search-icon bk-spin" size={20} aria-hidden="true" />
            ) : (
                <Search className="bk-search-icon" size={20} aria-hidden="true" />
            )}
            <input
                ref={inputRef}
                onFocus={() => { hadFocus.current = true; }}
                onBlur={() => { if (!props.isLoading) hadFocus.current = false; }}
                type="search"
                placeholder="Search by title or author"
                value={props.value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                disabled={props.isLoading}
            />
        </label>
    )
}

export default Searchbar;
