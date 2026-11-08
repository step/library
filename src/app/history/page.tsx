import PastReads from "@/components/PastReads";
import { loadReturnedBooks } from "./action";

export default async function HistoryPage() {
  const books = await loadReturnedBooks();

  return (
    <PastReads books={books} />
  );
}
