"use client";
import LoaderOverlay from "@/components/LoaderOverlay";
import Scanner from "@/components/Scanner";
import Snackbar from "@/components/Snackbar";
import { useSnackbar } from "@/utils/useSnackbar";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { returnBook } from "../BooksApi";


const ReturnBook = () => {
    const [loading, setLoading] = useState(false);
    const { snackbar, showSuccess, showError, close } = useSnackbar();

    const router = useRouter();

    const handleScanError = useCallback(() => {
        showError("Failed to scan QR code. Please try again.");
    }, [showError]);

    const handleReturnBook = useCallback(async (barcode: string) => {
        setLoading(true);
        const result = await returnBook(barcode);
        setLoading(false);
        if (result.success) {
            showSuccess("Book returned successfully");
            router.refresh();
        } else {
            showError(`Failed to return book: ${result.data.message}`);
        }
    }, [showSuccess, showError, setLoading, router]);

    return (
        <div>
            {loading && <LoaderOverlay title="Processing" message="Please wait while we process your request..." />}
            <Scanner
                onScanResult={handleReturnBook}
                onScanError={handleScanError}
                className="floating-actions"
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

export default ReturnBook;