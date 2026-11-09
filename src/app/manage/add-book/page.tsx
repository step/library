import BackLink from "@/components/manage/BackLink";
import NewBookForm from "./NewBookForm";

export default function AddBookPage() {
    return (
        <>
            <BackLink />
            <h1 className="mg-h1">Add a book</h1>
            <p className="mg-sub">Fill in the details, or scan to have them filled in for you.</p>
            <NewBookForm />
        </>
    );
}
