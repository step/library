"use client";
import { signIn } from "next-auth/react";
import { Lexend } from "next/font/google";
import "../styles/Login.css";

const lexend = Lexend({ subsets: ["latin"], weight: ["400", "500", "600"] });

const iconProps = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
};

const FEATURES = [
    {
        title: "Scan to borrow or return",
        description: "Point your camera at the QR code on any book.",
        icon: (
            <svg {...iconProps}>
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                <rect x="7" y="7" width="4" height="4" />
                <rect x="13" y="7" width="4" height="4" />
                <rect x="7" y="13" width="4" height="4" />
                <path d="M14 14h3v3" />
            </svg>
        ),
    },
    {
        title: "See what you have out",
        description: "Every borrowed book and how long you have had it.",
        icon: (
            <svg {...iconProps}>
                <path d="M12 7v14" />
                <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
            </svg>
        ),
    },
    {
        title: "Look back at past reads",
        description: "Dates borrowed and returned for every book.",
        icon: (
            <svg {...iconProps}>
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M12 7v5l4 2" />
            </svg>
        ),
    },
];

const BrandMark = () => (
    <span className="lb-mark">
        <svg {...iconProps}>
            <path d="m16 6 4 14" />
            <path d="M12 6v14" />
            <path d="M8 8v12" />
            <path d="M4 4v16" />
        </svg>
    </span>
);

const Illustration = ({ className, shadow, shadowOpacity }: { className: string; shadow: string; shadowOpacity: number }) => (
    <svg
        className={`lb-ill ${className}`}
        viewBox="0 0 320 232"
        role="img"
        aria-label="Illustration of a girl sitting cross-legged on the floor, reading a book"
    >
        <circle cx="160" cy="116" r="100" style={{ fill: "var(--ill-bg)" }} />
        <ellipse cx="160" cy="206" rx="110" ry="8" fill={shadow} opacity={shadowOpacity} />
        <rect x="238" y="186" width="58" height="16" rx="2" fill="#1795D4" />
        <rect x="244" y="171" width="48" height="15" rx="2" fill="#269C9E" />
        <rect x="240" y="157" width="52" height="14" rx="2" fill="#F07C00" />
        <path d="M116 188 L192 194" stroke="#3A4144" strokeWidth="22" strokeLinecap="round" fill="none" />
        <path d="M102 190 C94 160 100 130 118 108 L150 110 C156 140 150 168 146 192 Z" fill="#1795D4" />
        <path d="M180 192 L128 199" stroke="#212526" strokeWidth="20" strokeLinecap="round" fill="none" />
        <circle cx="124" cy="199" r="9" fill="#E0A87F" />
        <circle cx="196" cy="195" r="9" fill="#E0A87F" />
        <rect x="135" y="104" width="12" height="12" fill="#E0A87F" />
        <circle cx="111" cy="74" r="11" fill="#212526" />
        <circle cx="133" cy="90" r="23" fill="#212526" />
        <circle cx="145" cy="94" r="17" fill="#E0A87F" />
        <path d="M130 80 C142 70 160 74 162 90 C152 84 142 84 130 80 Z" fill="#212526" />
        <circle cx="154" cy="97" r="1.8" fill="#212526" />
        <path d="M130 122 L148 160 L176 148" stroke="#0F7DB5" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <polygon points="176,118 198,126 196,162 174,154" fill="#F07C00" />
        <polygon points="174,154 196,162 194,166 172,158" fill="#FFFFFF" />
        <line x1="176" y1="118" x2="174" y2="154" stroke="#B85F00" strokeWidth="3" />
        <circle cx="178" cy="148" r="6" fill="#E0A87F" />
    </svg>
);

const Login = () => {
    return (
        <div className={`lb-signin ${lexend.className}`}>
            <section className="lb-signin-aside">
                <div className="lb-brand">
                    <BrandMark />
                    <span>Library</span>
                </div>
                <div>
                    <h2>Borrow and return books in seconds</h2>
                    <ul className="lb-feats">
                        {FEATURES.map((f) => (
                            <li className="lb-feat" key={f.title}>
                                <span className="lb-feat-ic">{f.icon}</span>
                                <span>
                                    <span className="lb-feat-t">{f.title}</span>
                                    <span className="lb-feat-d">{f.description}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
                <Illustration className="lb-ill-aside" shadow="#101314" shadowOpacity={0.25} />
            </section>
            <section className="lb-signin-main">
                <div className="lb-signin-card">
                    <Illustration className="lb-ill-card" shadow="#22567C" shadowOpacity={0.16} />
                    <h1>Sign in to Library</h1>
                    <p>Use your Google account to borrow and return books and keep track of what you are reading.</p>
                    <button className="lb-google" onClick={() => signIn("google")}>
                        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                        </svg>
                        <span>Continue with Google</span>
                    </button>
                    <p className="lb-fine">We only use your Google account to identify you in the library.</p>
                </div>
            </section>
        </div>
    );
};

export default Login;
