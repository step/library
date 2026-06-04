"use client";
import { BookOpenCheckIcon, CopyPlusIcon, UsersIcon } from "lucide-react";
import StickyFooter from "../../../components/StickyFooter";

type ListProps = {
    label: string;
    description: string;
    icon: React.ReactNode;
    href: string;
}

const ListItem = (props: ListProps) => {
    return (
        <div
            className="list-item"
            onClick={() => window.location.assign(props.href)}
        >
            <div className="item-icon">
                {props.icon}
            </div>
            <div>
                <span className="list-label">{props.label}</span>
                <p className="list-description">{props.description}</p>
            </div>
        </div>
    )
}

export default function ManagePage() {
    return (
        <div style={{ paddingBottom: '80px', margin: '16px 0px 0px 16px', }}>
            <div>
                <h6 className="page-title">Manage Your Library</h6>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
                <ListItem
                    label="Add New Book"
                    description="Add a new book to your library"
                    icon={<CopyPlusIcon size={20} color="var(--main-color)" />}
                    href="/manage/add-book"
                />
                <ListItem
                    label="Generate Book QR Code"
                    description="Generate a QR code for a book to easily share its details"
                    icon={<CopyPlusIcon size={20} color="var(--main-color)" />}
                    href="/manage/generate-qr-code"
                />
                <ListItem
                    label="View All Borrowed Books"
                    description="See all books currently borrowed by users"
                    icon={<BookOpenCheckIcon size={20} color="var(--main-color)" />}
                    href="/manage/borrowed-books"
                />
                <ListItem
                    label="Manage Users"
                    description="Add, remove, and update user roles"
                    icon={<UsersIcon size={20} color="var(--main-color)" />}
                    href="/manage/users"
                />
            </div>

            <StickyFooter activeTab="books" allowManagement/>
        </div>
    );
}
