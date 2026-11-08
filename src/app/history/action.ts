import { getReturnedBooks } from "../../../db/borrowedBooks";
import { getLoggedInUser } from "../../../db/user";

export const loadReturnedBooks = async () => {
    const user = await getLoggedInUser();
    if (!user) {
        throw new Error("User not logged in");
    }

    return getReturnedBooks(user.id);
}
