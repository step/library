import ReadingBooks from "@/components/ReadingBooks";
import { loadReadingBooks } from "./action";

export default async function ReadingPage() {
  const books = await loadReadingBooks();

  return (
    <ReadingBooks books={books} />
  );
}
