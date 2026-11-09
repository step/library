"use client";
import { useEffect, useRef } from "react";
import "../../styles/Manage.css";

type Props = {
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
};

/** Destructive confirmation. Esc cancels, focus starts on Cancel and stays inside the dialog. */
const ConfirmDialog = ({ title, description, confirmLabel, onConfirm, onCancel }: Props) => {
    const cancelRef = useRef<HTMLButtonElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        cancelRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onCancel();
            } else if (e.key === "Tab") {
                const first = cancelRef.current;
                const last = confirmRef.current;
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first?.focus();
                }
            }
        };
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
            previous?.focus();
        };
    }, [onCancel]);

    return (
        <div className="mg-modal">
            <div className="mg-dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-d">
                <h2 className="mg-dialog-t" id="dlg-t">{title}</h2>
                <p className="mg-dialog-d" id="dlg-d">{description}</p>
                <div className="mg-dialog-act">
                    <button className="mg-btn-outline" ref={cancelRef} onClick={onCancel}>Cancel</button>
                    <button className="mg-btn-red" ref={confirmRef} onClick={onConfirm}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
