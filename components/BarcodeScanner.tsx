import { Scanner } from '@yudiel/react-qr-scanner';
import IconButton from './IconButton';
import ArrowBack from './icons/ArrowBack';
import "../styles/BarcodeScanner.css";


const ScannerControls = (props: { onCancel: () => void }) => {
    const { onCancel } = props;
    return (
        <div className="scanner-controls">
            <IconButton 
                icon={<ArrowBack size={24} color="white" />}
                title="Cancel scan"
                onClick={onCancel}
                className="white"
            />
            <div style={{ flexGrow: 1 }} />
        </div>
    );
};

type BarcodeScannerProps = {
    onResult: (result: string) => void;
    onError: (error: Error) => void;
    opened: boolean;
    onCancel: () => void;
};

const BarcodeScanner = (props: BarcodeScannerProps) => {
    const { onResult, onError, opened, onCancel } = props;
    if (!opened) return <></>;

    return (
        <div className="barcode-container">
            <ScannerControls onCancel={onCancel} />
            <div>
                <Scanner
                    onScan={(results) => {
                        const value = results[0]?.rawValue;
                        if (value) onResult(value);
                    }}
                    onError={e => onError(e as Error)}
                    formats={['ean_13', 'qr_code']}
                />
            </div>
        </div>
    );
};

export default BarcodeScanner;
