import Link from "next/link";
import { getAllLibraryUsers } from "../../../../db/user";
import UsersManager from "./UsersManager";

const UsersPage = async () => {
    const users = await getAllLibraryUsers();

    return (
        <div className="page-container">
            <div>
                <Link href="/manage" className="back-link">← Back</Link>
                <h6 className="page-title">Manage Users</h6>
            </div>
            <UsersManager initialUsers={users} />
        </div>
    );
}

export default UsersPage;
