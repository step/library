"use client";
import { QrCodeIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import PrimaryButton from "./PrimaryButton";
import LoadingSpinner from "./LoadingSpinner";

// Dynamic import for BarcodeScanner to reduce initial bundle size
const BarcodeScanner = dynamic(() => import("./BarcodeScanner"), {
    loading: () => <LoadingSpinner size="medium" message="Loading scanner..." />,
    ssr: false
});

type ScannerProps = {
    onScanResult: (result: string) => void;
    onScanError: (error: string) => void;
    title?: string;
    className?: string;
    /** Render the app's floating "Scan QR" button instead of the compact primary button. */
    fab?: boolean;
}

const Scanner = ({ onScanResult, onScanError, className = "", title = "Scan", fab = false }: ScannerProps) => {
    const [showScanner, setShowScanner] = useState(false);
    // A live camera reports the same code many times a second. Only the first result of each
    // opening counts; later ones would otherwise borrow or return the same book repeatedly.
    const handled = useRef(false);
    useEffect(() => {
        if (showScanner) handled.current = false;
    }, [showScanner]);
    const toggleShowScanner = () => setShowScanner(open => !open);
    const handleResult = (scanResult: string) => {
        if (handled.current) return;
        handled.current = true;
        setShowScanner(false);
        onScanResult(scanResult);
    };
    const handleError = (error: unknown) => {
        if (handled.current) return;
        handled.current = true;
        // Stryker disable next-line all: logging only
        console.error("Barcode scan error:", error);
        setShowScanner(false);
        onScanError("Failed to scan barcode. Please try again.");
    };

    return (
        <div>
            {fab ? (
                <button className="sh-fab" onClick={toggleShowScanner} aria-label="Scan QR code">
                    <QrCodeIcon size={24} aria-hidden="true" />
                    <span>Scan QR</span>
                </button>
            ) : (
                <div className={className}>
                    <PrimaryButton onClick={toggleShowScanner} title={title}>
                        <QrCodeIcon size={22} />
                    </PrimaryButton>
                </div>
            )}
            <BarcodeScanner
                onResult={handleResult}
                onError={handleError}
                opened={showScanner}
                onCancel={() => setShowScanner(false)}
            />
        </div>
    )
}

export default Scanner;