import { AlertCircle } from "lucide-react";

const FieldError = ({ id, message }: { id: string; message?: string }) =>
    message ? (
        <p className="mg-err" id={id}>
            <AlertCircle size={16} aria-hidden="true" />
            <span>{message}</span>
        </p>
    ) : null;

export default FieldError;
