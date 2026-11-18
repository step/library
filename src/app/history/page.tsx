import PastReads, { ARRIVAL_TOASTS, ArrivalToast } from "@/components/PastReads";
import { loadReturnedBooks } from "./action";

type Props = { searchParams?: Promise<{ toast?: string | string[] }> };

const isArrivalToast = (value: unknown): value is ArrivalToast =>
  typeof value === "string" && Object.hasOwn(ARRIVAL_TOASTS, value);

export default async function HistoryPage({ searchParams }: Props = {}) {
  const books = await loadReturnedBooks();
  const toast = (await searchParams)?.toast;

  return (
    <PastReads books={books} toast={isArrivalToast(toast) ? toast : undefined} />
  );
}
