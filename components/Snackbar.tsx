"use client";
import { useEffect } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import "../styles/Manage.css";

export interface SnackbarProps {
    message: string;
    type: "success" | "error";
    isOpen: boolean;
    onClose: () => void;
    duration?: number; // Duration in milliseconds, default 4000ms
    autoClose?: boolean; // Whether to auto-close, default true
}

const Snackbar = ({
    message,
    type,
    isOpen,
    onClose,
    duration = 4000,
    autoClose = true
}: SnackbarProps) => {
    useEffect(() => {
        if (!isOpen || !autoClose || duration <= 0) return;
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
    }, [isOpen, duration, autoClose, onClose]);

    if (!isOpen) return null;

    const ok = type === "success";
    return (
        <div className={`mg-toast ${ok ? "mg-toast-ok" : "mg-toast-err"}`} role={ok ? "status" : "alert"}>
            {ok ? <CheckCircle2 size={20} aria-hidden="true" /> : <AlertCircle size={20} aria-hidden="true" />}
            <span className="mg-toast-t">{message}</span>
            <button className="mg-toast-x" onClick={onClose} aria-label="Dismiss notification">
                <X size={18} aria-hidden="true" />
            </button>
        </div>
    );
};

export default Snackbar;
