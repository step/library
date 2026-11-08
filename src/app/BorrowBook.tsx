"use client";
import { useCallback, useState } from "react";
import LoaderOverlay from "@/components/LoaderOverlay";
import Scanner from "@/components/Scanner";
import Snackbar from "@/components/Snackbar";
import { useSnackbar } from "../../utils/useSnackbar";
import { borrowBook } from "./BooksApi";


const BorrowBook = () => {
    const [loading, setLoading] = useState(false);
    const { snackbar, close, showSuccess, showError } = useSnackbar();

    const processBorrowBook = useCallback(async (result: string) => {
        setLoading(true);
        const { success, data } = await borrowBook(result);
        setLoading(false);
        if (success) {
            showSuccess('Book borrowed successfully');
        } else {
            showError(data.message)
        }
    }, [showSuccess, showError]);

    const handleScanError = useCallback((error: string) => showError(`Scan error: ${error}`), [showError]);

    return (
        <div>
            {loading && <LoaderOverlay title="Loading" message="Please wait while we process your request..." />}
            <Scanner
                onScanResult={processBorrowBook}
                onScanError={handleScanError}
                fab
            />
            <Snackbar
                message={snackbar.message}
                type={snackbar.type}
                isOpen={snackbar.isOpen}
                onClose={close}
                duration={4000}
                autoClose={true}
            />
        </div>
    )
}

export default BorrowBook;