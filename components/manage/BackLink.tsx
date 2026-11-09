import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const BackLink = () => (
    <Link href="/manage" className="mg-back">
        <ChevronLeft size={20} aria-hidden="true" />
        <span>Manage</span>
    </Link>
);

export default BackLink;
