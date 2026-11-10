import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "../../../../../types/User";

import UsersManager from "../UsersManager";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let fetchMock: ReturnType<typeof vi.fn>;

const user = (id: number, over: Partial<User> = {}): User => ({ id, name: `User ${id}`, email: `u${id}@x.com`, isAdmin: false, batchId: 1, ...over });
const INITIAL = [user(1, { name: "Ada Admin", email: "ada@x.com", isAdmin: true, batchId: 12 }), user(2, { name: "Bob Member", email: "bob@x.com" })];

beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const fillForm = async (v: { name?: string; email?: string; batch?: string; admin?: boolean }) => {
    if (v.name !== undefined) await userEvent.type(field("Name"), v.name);
    if (v.email !== undefined) await userEvent.type(field("Email"), v.email);
    if (v.batch !== undefined) await userEvent.type(field("Batch"), v.batch);
    if (v.admin) await userEvent.click(screen.getByLabelText("Make this user an admin"));
};
const addUser = () => userEvent.click(screen.getByRole("button", { name: /^(add user|adding\.\.\.)$/i }));
const rowOf = (name: string) => screen.getByText(name).closest("li")!;
const csvFile = (text: string, name = "people.csv") => new File([text], name, { type: "text/csv" });
const chooseCsv = async (text: string, name?: string) => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, csvFile(text, name));
};

describe("UsersManager: list", () => {
    it("shows everyone with batch and role, and a count", () => {
        render(<UsersManager initialUsers={INITIAL} />);
        expect(screen.getByRole("heading", { name: "All users (2)" })).toBeInTheDocument();
        const ada = rowOf("Ada Admin");
        expect(within(ada).getByText("ada@x.com")).toBeInTheDocument();
        expect(within(ada).getByText("Batch 12")).toBeInTheDocument();
        expect(within(ada).getByText("Admin")).toBeInTheDocument();
        expect(within(rowOf("Bob Member")).getByText("User")).toBeInTheDocument();
    });
    it("offers the opposite role as the action", () => {
        render(<UsersManager initialUsers={INITIAL} />);
        expect(within(rowOf("Ada Admin")).getByRole("button", { name: "Make user" })).toBeInTheDocument();
        expect(within(rowOf("Bob Member")).getByRole("button", { name: "Make admin" })).toBeInTheDocument();
    });
    it("says so when there are no users", () => {
        render(<UsersManager initialUsers={[]} />);
        expect(screen.getByText("No users found.")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "All users (0)" })).toBeInTheDocument();
    });
    it("shows names as plain text", () => {
        render(<UsersManager initialUsers={[user(1, { name: "<img src=x onerror=alert(1)>" })]} />);
        expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
        expect(document.querySelector("img")).toBeNull();
    });
});

describe("UsersManager: add a user", () => {
    it("an empty form shows every problem and sends nothing", async () => {
        render(<UsersManager initialUsers={[]} />);
        await addUser();
        expect(screen.getByText("Enter a name")).toBeInTheDocument();
        expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
        expect(screen.getByText("Enter a batch number, for example 12")).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        ["plain", false], ["a@b", false], ["a b@x.com", false], ["@x.com", false], ["a@x.", false],
        ["a@x.co", true], ["first.last+tag@sub.example.org", true],
    ])("email %j valid=%s", async (email, valid) => {
        fetchMock.mockResolvedValue(json({ user: user(9) }, 201));
        render(<UsersManager initialUsers={[]} />);
        await fillForm({ name: "N", email, batch: "1" });
        await addUser();
        expect(screen.queryByText("Enter a valid email address") === null).toBe(valid);
    });

    it.each([["12", true], ["1", true], ["0", false], ["012", false], ["1.5", false], ["abc", false], ["-1", false], [" ", false]])("batch %j valid=%s", async (batch, valid) => {
        fetchMock.mockResolvedValue(json({ user: user(9) }, 201));
        render(<UsersManager initialUsers={[]} />);
        await fillForm({ name: "N", email: "n@x.com", batch });
        await addUser();
        expect(screen.queryByText(/Enter a batch number/) === null).toBe(valid);
    });

    it("typing clears just that field's error", async () => {
        render(<UsersManager initialUsers={[]} />);
        await addUser();
        await userEvent.type(field("Name"), "A");
        expect(screen.queryByText("Enter a name")).not.toBeInTheDocument();
        expect(screen.getByText("Enter a valid email address")).toBeInTheDocument();
    });

    it("sends trimmed values, a numeric batch and the admin flag, then shows the new user first", async () => {
        const created = user(9, { name: "Zed", email: "zed@x.com", isAdmin: true, batchId: 7 });
        fetchMock.mockResolvedValue(json({ user: created }, 201));
        render(<UsersManager initialUsers={INITIAL} />);
        await fillForm({ name: "  Zed ", email: " zed@x.com ", batch: " 7 ", admin: true });
        await addUser();
        expect(fetchMock).toHaveBeenCalledWith("/api/users", expect.objectContaining({ method: "POST" }));
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "Zed", email: "zed@x.com", isAdmin: true, batchId: 7 });
        expect(await screen.findByText("User added")).toBeInTheDocument();
        const items = screen.getAllByRole("listitem").map(li => li.querySelector(".mg-t")?.textContent);
        expect(items[0]).toBe("Zed");
        expect(screen.getByRole("heading", { name: "All users (3)" })).toBeInTheDocument();
        expect(field("Name")).toHaveValue("");
        expect(field("Batch")).toHaveValue("");
        expect(screen.getByLabelText("Make this user an admin")).not.toBeChecked();
    });

    it("shows an inline message when the email already exists", async () => {
        fetchMock.mockResolvedValue(json({ error: "exists" }, 409));
        render(<UsersManager initialUsers={INITIAL} />);
        await fillForm({ name: "N", email: "ada@x.com", batch: "1" });
        await addUser();
        expect(await screen.findByText("A user with this email already exists.")).toBeInTheDocument();
        expect(field("Name")).toHaveValue("N");
        expect(screen.getByRole("heading", { name: "All users (2)" })).toBeInTheDocument();
    });

    it("shows the server's message for other failures, or a default", async () => {
        fetchMock.mockResolvedValueOnce(json({ error: "batchId is required" }, 400));
        render(<UsersManager initialUsers={[]} />);
        await fillForm({ name: "N", email: "n@x.com", batch: "1" });
        await addUser();
        expect(await screen.findByText("batchId is required")).toBeInTheDocument();
        fetchMock.mockResolvedValueOnce(json({}, 500));
        await addUser();
        expect(await screen.findByText("Failed to add user")).toBeInTheDocument();
    });

    it("says so when the network fails, and keeps the form", async () => {
        fetchMock.mockRejectedValue(new TypeError("offline"));
        render(<UsersManager initialUsers={[]} />);
        await fillForm({ name: "N", email: "n@x.com", batch: "1" });
        await addUser();
        expect(await screen.findByText("Failed to add user")).toBeInTheDocument();
        expect(field("Name")).toHaveValue("N");
    });

    it("disables the buttons and sends once while adding", async () => {
        let finish!: (r: Response) => void;
        fetchMock.mockReturnValue(new Promise<Response>(r => { finish = r; }));
        render(<UsersManager initialUsers={INITIAL} />);
        await fillForm({ name: "N", email: "n@x.com", batch: "1" });
        await addUser();
        expect(screen.getByRole("button", { name: "Adding..." })).toBeDisabled();
        for (const b of screen.getAllByRole("button", { name: /Make (admin|user)|Remove/ })) expect(b).toBeDisabled();
        act(() => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        await act(async () => { finish(json({ user: user(9) }, 201)); });
    });
});

describe("UsersManager: change a role", () => {
    it("promotes, updates the row and says so", async () => {
        fetchMock.mockResolvedValue(json({}));
        render(<UsersManager initialUsers={INITIAL} />);
        await userEvent.click(within(rowOf("Bob Member")).getByRole("button", { name: "Make admin" }));
        expect(fetchMock).toHaveBeenCalledWith("/api/users/2", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isAdmin: true }) }));
        expect(await screen.findByText("Role updated to Admin")).toBeInTheDocument();
        expect(within(rowOf("Bob Member")).getByText("Admin")).toBeInTheDocument();
        expect(within(rowOf("Bob Member")).getByRole("button", { name: "Make user" })).toBeInTheDocument();
    });

    it("demotes", async () => {
        fetchMock.mockResolvedValue(json({}));
        render(<UsersManager initialUsers={INITIAL} />);
        await userEvent.click(within(rowOf("Ada Admin")).getByRole("button", { name: "Make user" }));
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ isAdmin: false });
        expect(await screen.findByText("Role updated to User")).toBeInTheDocument();
    });

    it("leaves the role alone and says so when the server refuses", async () => {
        fetchMock.mockResolvedValue(json({ error: "Forbidden" }, 403));
        render(<UsersManager initialUsers={INITIAL} />);
        await userEvent.click(within(rowOf("Bob Member")).getByRole("button", { name: "Make admin" }));
        expect(await screen.findByText("Failed to update role")).toBeInTheDocument();
        expect(within(rowOf("Bob Member")).getByText("User")).toBeInTheDocument();
    });

    it("leaves the role alone on a network failure", async () => {
        fetchMock.mockRejectedValue(new TypeError("offline"));
        render(<UsersManager initialUsers={INITIAL} />);
        await userEvent.click(within(rowOf("Bob Member")).getByRole("button", { name: "Make admin" }));
        expect(await screen.findByText("Failed to update role")).toBeInTheDocument();
        expect(within(rowOf("Bob Member")).getByRole("button", { name: "Make admin" })).toBeEnabled();
    });

    it("only one change can run at a time", async () => {
        let finish!: (r: Response) => void;
        fetchMock.mockReturnValue(new Promise<Response>(r => { finish = r; }));
        render(<UsersManager initialUsers={INITIAL} />);
        await userEvent.click(within(rowOf("Bob Member")).getByRole("button", { name: "Make admin" }));
        expect(within(rowOf("Ada Admin")).getByRole("button", { name: "Make user" })).toBeDisabled();
        await act(async () => { finish(json({})); });
    });
});

describe("UsersManager: remove a user", () => {
    const askToRemove = (name: string) => userEvent.click(within(rowOf(name)).getByRole("button", { name: `Remove ${name}` }));

    it("asks first, naming the person", async () => {
        render(<UsersManager initialUsers={INITIAL} />);
        await askToRemove("Bob Member");
        expect(screen.getByRole("alertdialog", { name: "Remove Bob Member from the library?" })).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("Cancel and Escape do nothing", async () => {
        render(<UsersManager initialUsers={INITIAL} />);
        await askToRemove("Bob Member");
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
        await askToRemove("Bob Member");
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.getByText("Bob Member")).toBeInTheDocument();
    });

    it("confirming deletes them and updates the list", async () => {
        fetchMock.mockResolvedValue(json({}));
        render(<UsersManager initialUsers={INITIAL} />);
        await askToRemove("Bob Member");
        await userEvent.click(screen.getByRole("button", { name: "Remove user" }));
        expect(fetchMock).toHaveBeenCalledWith("/api/users/2", { method: "DELETE" });
        expect(await screen.findByText("User removed")).toBeInTheDocument();
        expect(screen.queryByText("Bob Member")).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "All users (1)" })).toBeInTheDocument();
    });

    it("keeps them and says so when the server refuses (for example they have borrowed books)", async () => {
        fetchMock.mockResolvedValue(json({ error: "User has borrowed books and cannot be deleted" }, 409));
        render(<UsersManager initialUsers={INITIAL} />);
        await askToRemove("Bob Member");
        await userEvent.click(screen.getByRole("button", { name: "Remove user" }));
        expect(await screen.findByText("Failed to delete user")).toBeInTheDocument();
        expect(screen.getByText("Bob Member")).toBeInTheDocument();
    });

    it("keeps them on a network failure", async () => {
        fetchMock.mockRejectedValue(new TypeError("offline"));
        render(<UsersManager initialUsers={INITIAL} />);
        await askToRemove("Bob Member");
        await userEvent.click(screen.getByRole("button", { name: "Remove user" }));
        expect(await screen.findByText("Failed to delete user")).toBeInTheDocument();
        expect(screen.getByText("Bob Member")).toBeInTheDocument();
    });
});

describe("UsersManager: CSV import", () => {
    it("previews valid rows without sending anything", async () => {
        render(<UsersManager initialUsers={[]} />);
        await chooseCsv("Ann,ann@x.com,3\nBen,ben@x.com,4,true", "class.csv");
        expect(await screen.findByText("2 users ready to import")).toBeInTheDocument();
        expect(screen.getByText("class.csv")).toBeInTheDocument();
        expect(screen.getByText("Ann")).toBeInTheDocument();
        expect(screen.getByText("Batch 4")).toBeInTheDocument();
        expect(within(screen.getByText("Ben").closest("li")!).getByText("Admin")).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("says '1 user' for a single row", async () => {
        render(<UsersManager initialUsers={[]} />);
        await chooseCsv("Ann,ann@x.com,3");
        expect(await screen.findByText("1 user ready to import")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Upload 1 user" })).toBeInTheDocument();
    });

    it("shows five rows and counts the rest", async () => {
        render(<UsersManager initialUsers={[]} />);
        await chooseCsv(Array.from({ length: 8 }, (_, i) => `N${i},n${i}@x.com,1`).join("\n"));
        expect(await screen.findByText("8 users ready to import")).toBeInTheDocument();
        expect(screen.getAllByText(/^Batch 1$/)).toHaveLength(5);
        expect(screen.getByText("+3 more")).toBeInTheDocument();
    });

    it("warns about rows that will be skipped, including a header row", async () => {
        render(<UsersManager initialUsers={[]} />);
        await chooseCsv("name,email,batch_id,is_admin\nAnn,ann@x.com,3\nbroken\n,x@x.com,1");
        expect(await screen.findByText("1 user ready to import")).toBeInTheDocument();
        expect(screen.getByText("3 rows will be skipped because of missing or invalid values.")).toBeInTheDocument();
    });

    it("handles Windows line endings and quoted commas", async () => {
        render(<UsersManager initialUsers={[]} />);
        await chooseCsv('"Smith, Jo",jo@x.com,5\r\nAnn,ann@x.com,3\r\n');
        expect(await screen.findByText("2 users ready to import")).toBeInTheDocument();
        expect(screen.getByText("Smith, Jo")).toBeInTheDocument();
    });

    it("refuses a file with no usable rows", async () => {
        render(<UsersManager initialUsers={[]} />);
        await chooseCsv("nonsense\nmore nonsense");
        expect(await screen.findByText("Bulk upload failed")).toBeInTheDocument();
        expect(screen.queryByText(/ready to import/)).not.toBeInTheDocument();
    });

    it("an empty file is refused too", async () => {
        render(<UsersManager initialUsers={[]} />);
        await chooseCsv("");
        expect(await screen.findByText("Bulk upload failed")).toBeInTheDocument();
    });

    it("uploads, adds the new people at the top and summarises, counting skipped rows from both sides", async () => {
        const created = [user(10, { name: "Ann", email: "ann@x.com" })];
        fetchMock.mockResolvedValue(json({ added: 1, skipped: 1, users: created }));
        render(<UsersManager initialUsers={INITIAL} />);
        await chooseCsv("Ann,ann@x.com,3\nAda,ada@x.com,12\nbad row");
        await screen.findByText("2 users ready to import");
        await userEvent.click(screen.getByRole("button", { name: "Upload 2 users" }));
        expect(fetchMock).toHaveBeenCalledWith("/api/users/bulk", expect.objectContaining({ method: "POST" }));
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).users).toEqual([
            { name: "Ann", email: "ann@x.com", batchId: 3, isAdmin: false },
            { name: "Ada", email: "ada@x.com", batchId: 12, isAdmin: false },
        ]);
        // 1 skipped by the server + 1 bad row skipped locally
        expect(await screen.findAllByText("1 user added, 2 skipped.")).not.toHaveLength(0);
        expect(screen.queryByText(/ready to import/)).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "All users (3)" })).toBeInTheDocument();
        expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Ann");
    });

    it("shows the server's message and keeps the preview when the upload fails", async () => {
        fetchMock.mockResolvedValue(json({ error: "Row 1: email is not a valid address" }, 400));
        render(<UsersManager initialUsers={[]} />);
        await chooseCsv("Ann,ann@x.com,3");
        await userEvent.click(await screen.findByRole("button", { name: "Upload 1 user" }));
        expect(await screen.findByText("Row 1: email is not a valid address")).toBeInTheDocument();
        expect(screen.getByText("1 user ready to import")).toBeInTheDocument();
    });

    it("shows a default message when the network fails", async () => {
        fetchMock.mockRejectedValue(new TypeError("offline"));
        render(<UsersManager initialUsers={[]} />);
        await chooseCsv("Ann,ann@x.com,3");
        await userEvent.click(await screen.findByRole("button", { name: "Upload 1 user" }));
        expect(await screen.findByText("Bulk upload failed")).toBeInTheDocument();
    });

    it("blocks the page while uploading and cannot be sent twice", async () => {
        let finish!: (r: Response) => void;
        fetchMock.mockReturnValue(new Promise<Response>(r => { finish = r; }));
        render(<UsersManager initialUsers={[]} />);
        await chooseCsv("Ann,ann@x.com,3");
        await userEvent.click(await screen.findByRole("button", { name: "Upload 1 user" }));
        expect(screen.getByText("Uploading...", { selector: ".mg-block-t" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Uploading..." })).toBeDisabled();
        await act(async () => { finish(json({ added: 1, skipped: 0, users: [] })); });
        await waitFor(() => expect(screen.queryByText("Uploading...", { selector: ".mg-block-t" })).not.toBeInTheDocument());
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("choosing a new file replaces the old preview and clears the last summary", async () => {
        fetchMock.mockResolvedValue(json({ added: 1, skipped: 0, users: [user(10)] }));
        render(<UsersManager initialUsers={[]} />);
        await chooseCsv("Ann,ann@x.com,3");
        await userEvent.click(await screen.findByRole("button", { name: "Upload 1 user" }));
        await screen.findAllByText("1 user added, 0 skipped.");
        await chooseCsv("Cy,cy@x.com,1\nDi,di@x.com,2", "next.csv");
        expect(await screen.findByText("2 users ready to import")).toBeInTheDocument();
        expect(document.querySelector(".mg-success")).toBeNull();
    });
});
