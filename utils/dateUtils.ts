export const formatBorrowDate = (borrowedDate: string): string => {
    const borrowed = new Date(borrowedDate);
    const now = new Date();
    
    // Format the date as "Feb 17, 2025"
    const formattedDate = borrowed.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
    
    // Calculate time difference
    const timeDiff = now.getTime() - borrowed.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));
    const monthsDiff = Math.floor(daysDiff / 30);
    const yearsDiff = Math.floor(daysDiff / 365);
    
    let timeAgo = '';
    if (yearsDiff > 0) {
        timeAgo = `${yearsDiff} yr${yearsDiff > 1 ? 's' : ''}.`;
    } else if (monthsDiff > 0) {
        timeAgo = `${monthsDiff} mo.`;
    } else if (daysDiff > 0) {
        timeAgo = `${daysDiff} day${daysDiff > 1 ? 's' : ''}`;
    } else {
        return `${formattedDate} (today)`;
    }
    
    return `${formattedDate} (${timeAgo} ago)`;
};


const DAY_MS = 24 * 60 * 60 * 1000;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Formats a date as "12 Oct 2026". */
export const formatShortDate = (date: string): string =>
    new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Describes how long ago a date was, e.g. "Today", "3 days ago", "2 months ago". */
export const formatTimeSince = (date: string): string => {
    const days = Math.floor((Date.now() - new Date(date).getTime()) / DAY_MS);
    if (days < 1) return 'Today';
    if (days < 30) return `${plural(days, 'day')} ago`;
    if (days < 365) return `${plural(Math.floor(days / 30), 'month')} ago`;
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return `${plural(years, 'year')}${months ? ` ${plural(months, 'month')}` : ''} ago`;
};

/** Describes the span between two dates, e.g. "Same day", "14 days", "3 months". */
export const formatDuration = (from: string, to: string): string => {
    const days = Math.floor((new Date(to).getTime() - new Date(from).getTime()) / DAY_MS);
    if (days < 1) return 'Same day';
    if (days < 30) return plural(days, 'day');
    if (days < 365) return plural(Math.floor(days / 30), 'month');
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    return `${plural(years, 'year')}${months ? ` ${plural(months, 'month')}` : ''}`;
};
