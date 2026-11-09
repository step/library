import BackLink from "@/components/manage/BackLink";
import QrSheet from "./QrSheet";

export default function GenerateQRCodePage() {
    return (
        <>
            <div className="mg-noprint">
                <BackLink />
                <h1 className="mg-h1">Generate QR codes</h1>
                <p className="mg-sub">Print a sheet and stick one code on each new copy.</p>
            </div>
            <QrSheet />
        </>
    );
}
