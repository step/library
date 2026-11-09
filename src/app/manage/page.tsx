import Link from "next/link";
import { BookPlus, ChevronRight, ClipboardList, QrCode, Users } from "lucide-react";

const TOOLS = [
    {
        href: "/manage/add-book",
        title: "Add book",
        description: "Add a title with a form, an ISBN scan or the QR code on a copy.",
        icon: <BookPlus size={24} aria-hidden="true" />,
    },
    {
        href: "/manage/generate-qr-code",
        title: "Generate book QR codes",
        description: "Make a printable sheet of QR codes to label new copies.",
        icon: <QrCode size={24} aria-hidden="true" />,
    },
    {
        href: "/manage/borrowed-books",
        title: "View borrowed books",
        description: "See who has which book, and mark a book as returned.",
        icon: <ClipboardList size={24} aria-hidden="true" />,
    },
    {
        href: "/manage/users",
        title: "Manage users",
        description: "Add people, import them from a CSV and set who is an admin.",
        icon: <Users size={24} aria-hidden="true" />,
    },
];

export default function ManagePage() {
    return (
        <>
            <h1 className="mg-h1">Manage</h1>
            <p className="mg-sub">Admin tools for the library&apos;s books and members.</p>
            <div className="mg-hub">
                {TOOLS.map((tool) => (
                    <Link key={tool.href} href={tool.href} className="mg-hubcard">
                        <span className="mg-hub-ic">{tool.icon}</span>
                        <span className="mg-hub-tx">
                            <span className="mg-hub-t">{tool.title}</span>
                            <span className="mg-hub-d">{tool.description}</span>
                        </span>
                        <ChevronRight className="mg-hub-go" size={20} aria-hidden="true" />
                    </Link>
                ))}
            </div>
        </>
    );
}
