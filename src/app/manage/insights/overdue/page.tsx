import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import "../../../../../styles/Insights.css";
import { OVERDUE_DAYS } from "@/utils/insights";
import { fetchOverdueLoans } from "../action";
import OverdueLoans from "./OverdueLoans";

export const dynamic = "force-dynamic";

const OverduePage = async () => {
    const loans = await fetchOverdueLoans();
    return (
        <div className="in-page">
            <Link href="/manage/insights" className="mg-back">
                <ChevronLeft size={20} aria-hidden="true" />
                <span>Insights</span>
            </Link>
            <h1 className="mg-h1">Overdue loans</h1>
            <p className="mg-sub">
                {loans.length === 1 ? "1 copy" : `${loans.length} copies`} out for more than {OVERDUE_DAYS} days, longest first.
            </p>
            <OverdueLoans loans={loans} />
        </div>
    );
};

export default OverduePage;
