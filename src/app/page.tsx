import Books from "../../components/Books";
import { loadBooksWithSearch } from "./action";

export default async function Home() {
  const books = await loadBooksWithSearch("");

  return (
    <Books books={books} />
  );
}
