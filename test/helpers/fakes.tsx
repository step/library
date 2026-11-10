import React from "react";

/** The code the fake scanner reports when its "fake scan ok" button is pressed. */
export const fakeScan = { code: "qr-1" };

/** Props the app passed to the most recent <BarcodeScanner>, so tests can fire scan events directly. */
export const scannerProps: { all: Array<Record<string, unknown>> } = { all: [] };

type FakeProps = {
    opened: boolean;
    onResult: (code: string) => void;
    onError: (e: Error) => void;
    onCancel: () => void;
};

/** Stand-in for components/BarcodeScanner: renders three buttons while open. */
export function FakeBarcodeScanner(props: FakeProps) {
    scannerProps.all.push(props as unknown as Record<string, unknown>);
    if (!props.opened) return null;
    return (
        <div data-testid="scanner">
            <button onClick={() => props.onResult(fakeScan.code)}>fake scan ok</button>
            <button onClick={() => props.onError(new Error("camera denied"))}>fake scan error</button>
            <button onClick={props.onCancel}>fake scan cancel</button>
        </div>
    );
}

export const lastScannerProps = () => scannerProps.all[scannerProps.all.length - 1] as unknown as FakeProps;
export const resetScanner = () => { scannerProps.all = []; fakeScan.code = "qr-1"; };
