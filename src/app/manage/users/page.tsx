import BackLink from "@/components/manage/BackLink";
import { getAllLibraryUsers } from "../../../../db/user";
import UsersManager from "./UsersManager";
import { requireAdminPage } from "@/app/lib/admin";

const UsersPage = async () => {
    await requireAdminPage();
    const users = await getAllLibraryUsers();

    return (
        <>
            <BackLink />
            <h1 className="mg-h1">Manage users</h1>
            <p className="mg-sub">Add people, import users in bulk and choose who can manage the library.</p>
            <UsersManager initialUsers={users} />
        </>
    );
}

export default UsersPage;
