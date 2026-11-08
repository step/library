import { Search, Loader2 } from "lucide-react";

const Searchbar = (props: {
    value: string;
    onChange: (s: string) => void;
    onSearch: () => void;
    isLoading?: boolean;
}) => {

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
