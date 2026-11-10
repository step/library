type IndustryIdentifier = {
    type: string;
    identifier: string;
}

type Author = {
    name: string;
}

const findBookFromGoogleApi = async (barcode: string) => {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(barcode)}`);
    if (!response.ok) return;
    const data = await response.json();
    const book = data?.items?.[0]?.volumeInfo;
    if (!book?.title) return;
    return {
        title: book.title,
        authors: book.authors ? book.authors.join(", ") : "",
        isbn10: book.industryIdentifiers?.find((id: IndustryIdentifier) => id.type === "ISBN_10")?.identifier || "",
        isbn13: book.industryIdentifiers?.find((id: IndustryIdentifier) => id.type === "ISBN_13")?.identifier || "",
    }
}

const findBookByOpenLibraryApi = async (barcode: string) => {
    const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(barcode)}&format=json&jscmd=data`);
    if (!response.ok) return;
    const data = await response.json();
    const book = data?.[`ISBN:${barcode}`];
    if (!book?.title) return;
    return {
        title: book.title,
        authors: book.authors ? book.authors.map((author: Author) => author.name).join(",") : "",
        isbn10: book.identifiers?.isbn_10 ? book.identifiers.isbn_10[0] : "",
        isbn13: book.identifiers?.isbn_13 ? book.identifiers.isbn_13[0] : "",
    }
}

type FoundBook = { title: string; authors: string; isbn10: string; isbn13: string };

/** Asks both services at once. One being down or returning junk must not hide the other's answer. */
export const findBook = async (barcode: string): Promise<FoundBook | undefined> => {
    const [googleBook, openLibraryBook] = await Promise.all([
        findBookFromGoogleApi(barcode).catch(() => undefined),
        findBookByOpenLibraryApi(barcode).catch(() => undefined),
    ]);
    return googleBook || openLibraryBook;
}
