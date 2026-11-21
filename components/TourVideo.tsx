"use client";
import { useCallback, useId, useRef, useState } from "react";
import { PlayCircle, X } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { lexend } from "../src/app/lib/fonts";
import "../styles/Tour.css";

/**
 * Files under public/onboarding/ are kept out of the service worker's precache (next.config.ts),
 * so the video downloads only when someone presses play, never when the app installs.
 */
export const TOUR = {
    video: "/onboarding/library-walkthrough.mp4",
    poster: "/onboarding/library-walkthrough-poster.jpg",
    captions: "/onboarding/library-walkthrough.vtt",
} as const;

const TourDialog = ({ onClose }: { onClose: () => void }) => {
    const dialog = useRef<HTMLDivElement>(null);
    const titleId = `${useId()}-t`;
    useFocusTrap(dialog, onClose);

    return (
        <div className={`tv-modal ${lexend.variable}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="tv-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
                <div className="tv-head">
                    <h2 className="tv-title" id={titleId}>How the library works</h2>
                    <button type="button" className="tv-x" aria-label="Close" onClick={onClose}>
                        <X size={22} aria-hidden="true" />
                    </button>
                </div>
                {/* Opened by a tap, so the browser lets it start with sound. */}
                <video className="tv-video" controls autoPlay playsInline preload="none" poster={TOUR.poster}>
                    <source src={TOUR.video} type="video/mp4" />
                    {/* Off by default: the video already shows each step as on-screen text, and the two
                        overlap on a phone. Viewers who need them turn them on from the player. */}
                    <track kind="captions" src={TOUR.captions} srcLang="en" label="English" />
                    Your browser cannot play this video.
                </video>
                <p className="tv-note">One minute: find, borrow, return and rate books.</p>
            </div>
        </div>
    );
};

/** A button that opens the one-minute walkthrough video in a dialog. */
const TourVideo = ({ label = "Watch a 1-minute tour", className = "tv-link" }: { label?: string; className?: string }) => {
    const [open, setOpen] = useState(false);
    const close = useCallback(() => setOpen(false), []);

    return (
        <>
            <button type="button" className={className} onClick={() => setOpen(true)}>
                <PlayCircle size={20} aria-hidden="true" />
                <span>{label}</span>
            </button>
            {open && <TourDialog onClose={close} />}
        </>
    );
};

export default TourVideo;
