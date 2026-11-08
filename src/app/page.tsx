import Books from "../../components/Books";
import { loadBooks } from "./action";

export default async function Home() {
  const books = await loadBooks();

  return (
    <Books books={books} />
  );
}
