/**
 * Builds an ILIKE pattern that matches `term` anywhere in the text, treating the characters
 * LIKE gives a meaning to (% _ \) literally. Without this, searching "%" matches every book.
 */
export const containsPattern = (term: string): string => `%${term.replace(/[\\%_]/g, "\\$&")}%`;
