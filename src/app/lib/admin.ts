import { redirect } from "next/navigation";
import { getLoggedInUser } from "../../../db/user";

/**
 * For admin pages. The /manage layout also checks, but Next.js can skip a layout on client-side
 * navigation, so every admin page must check for itself before it loads data.
 */
export const requireAdminPage = async () => {
    const user = await getLoggedInUser();
    if (!user) redirect("/login");
    if (!user.isAdmin) redirect("/");
    return user;
};
