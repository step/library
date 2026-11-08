import StickyFooter from "../../../components/StickyFooter";
import { getLoggedInUser } from "../../../db/user";

export default async function Home() {
  const user = await getLoggedInUser();

  return (
    <div style={{ paddingBottom: '80px' }}>
      <StickyFooter activeTab="request" allowManagement={user?.isAdmin || false} />
    </div>
  );
}
