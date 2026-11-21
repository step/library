"use client";
import { useCallback, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
    /** 9:16 cut at 720p for phones held upright: fills the screen with no need to go full screen. */
    portraitVideo: "/onboarding/library-walkthrough-portrait.mp4",
    portraitPoster: "/onboarding/library-walkthrough-portrait-poster.jpg",
    captions: "/onboarding/library-walkthrough.vtt",
} as const;

/** Matches the app's phone layout (below the 768px tablet breakpoint), held upright. */
export const PHONE_PORTRAIT = "(max-width: 767px) and (orientation: portrait)";

const isPhonePortrait = () => typeof window !== "undefined" && window.matchMedia?.(PHONE_PORTRAIT).matches === true;

const TourDialog = ({ onClose }: { onClose: () => void }) => {
    const dialog = useRef<HTMLDivElement>(null);
    const titleId = `${useId()}-t`;
    useFocusTrap(dialog, onClose);
    // Chosen once on open: switching the source mid-play would restart the video.
    const [portrait] = useState(isPhonePortrait);

    return (
        <div className={`tv-modal ${portrait ? "tv-phone" : ""} ${lexend.variable}`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="tv-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
                <div className="tv-head">
                    <h2 className="tv-title" id={titleId}>How the library works</h2>
                    <button type="button" className="tv-x" aria-label="Close" onClick={onClose}>
                        <X size={22} aria-hidden="true" />
                    </button>
                </div>
                {/* Opened by a tap, so the browser lets it start with sound. On phones the dialog already
                    fills the screen, and Android's full screen turns a phone sideways and could leave the
                    picture black while the sound played on, so the full-screen button is hidden there. */}
                <video
                    className="tv-video"
                    controls
                    autoPlay
                    playsInline
                    preload="none"
                    poster={portrait ? TOUR.portraitPoster : TOUR.poster}
                    controlsList={portrait ? "nofullscreen" : undefined}
                >
                    <source src={portrait ? TOUR.portraitVideo : TOUR.video} type="video/mp4" />
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
            {/* Portalled to <body>: the buttons live inside the sticky sidebar and top bar, which form
                their own stacking contexts, so the page content painted over a dialog left inside them. */}
            {open && createPortal(<TourDialog onClose={close} />, document.body)}
        </>
    );
};

export default TourVideo;
