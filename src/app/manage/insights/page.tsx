import BackLink from "@/components/manage/BackLink";
import "../../../../styles/Insights.css";
import { getInsightsOverview } from "./action";
import ActivityPanel from "./ActivityPanel";
import BatchTable from "./BatchTable";
import HeadlineStats from "./HeadlineStats";
import IdleBooks from "./IdleBooks";
import LoanAge from "./LoanAge";
import TopReadersPanel from "./TopReadersPanel";

// Always current: admins open this to act on today's numbers.
export const dynamic = "force-dynamic";

const InsightsPage = async () => {
    const data = await getInsightsOverview();
    return (
        <div className="in-page">
            <BackLink />
            <h1 className="mg-h1">Insights</h1>
            <p className="mg-sub">How the library is being used.</p>
            <HeadlineStats stats={data.headline} />
            <div className="in-pair">
                <ActivityPanel initial={data.activity} />
                <LoanAge buckets={data.loanAge} overdue={data.headline.overdue} />
            </div>
            <TopReadersPanel initial={data.topReaders} />
            <IdleBooks books={data.idleBooks} />
            <BatchTable batches={data.batches} />
        </div>
    );
};

export default InsightsPage;
