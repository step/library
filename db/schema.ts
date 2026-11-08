import { pgTable, check, index, serial, integer, varchar, text, bigint, foreignKey, timestamp, unique, boolean, primaryKey, uniqueIndex } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const accounts = pgTable("accounts", {
	id: serial().primaryKey().notNull(),
	userId: integer().notNull(),
	type: varchar({ length: 255 }).notNull(),
	provider: varchar({ length: 255 }).notNull(),
	providerAccountId: varchar({ length: 255 }).notNull(),
	refreshToken: text("refresh_token"),
	accessToken: text("access_token"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	expiresAt: bigint("expires_at", { mode: "number" }),
	idToken: text("id_token"),
	scope: text(),
	sessionState: text("session_state"),
	tokenType: text("token_type"),
}, (table) => [
	index("idx_accounts_provider").using("btree", table.provider.asc().nullsLast(), table.providerAccountId.asc().nullsLast()),
	index("idx_accounts_user_id").using("btree", table.userId.asc().nullsLast()),
]);

export const borrowedBooks = pgTable("borrowed_books", {
	id: serial().primaryKey().notNull(),
	bookCopyId: integer("book_copy_id").notNull(),
	userId: integer("user_id").notNull(),
	borrowedAt: timestamp("borrowed_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	returnedAt: timestamp("returned_at", { mode: 'string' }),
}, (table) => [
	index("idx_borrowed_books_book_copy_id").using("btree", table.bookCopyId.asc().nullsLast()),
	index("idx_borrowed_books_user_borrowed").using("btree", table.userId.asc().nullsLast(), table.borrowedAt.asc().nullsLast()).where(sql`(returned_at IS NULL)`),
	index("idx_borrowed_books_user_id").using("btree", table.userId.asc().nullsLast()),
	// A copy can have at most one open (unreturned) loan.
	uniqueIndex("uq_borrowed_books_open_copy").using("btree", table.bookCopyId.asc().nullsLast()).where(sql`(returned_at IS NULL)`),
	foreignKey({
			columns: [table.bookCopyId],
			foreignColumns: [bookCopies.id],
			name: "borrowed_books_book_copy_id_fkey"
		}).onDelete("cascade"),
]);

export const libraryUsers = pgTable("library_users", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 255 }).notNull(),
	isAdmin: boolean("is_admin").default(false),
	batchId: integer("batch_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_library_users_email").using("btree", table.email.asc().nullsLast()),
	unique("library_users_email_key").on(table.email),
]);

export const booksDb = pgTable("books_db", {
	id: serial().primaryKey().notNull(),
	title: varchar({ length: 255 }).notNull(),
	authors: text(),
	isbn10: varchar({ length: 10 }),
	isbn13: varchar({ length: 13 }),
}, (table) => [
	index("idx_books_db_isbn10").using("btree", table.isbn10.asc().nullsLast()),
	index("idx_books_db_isbn13").using("btree", table.isbn13.asc().nullsLast()),
	unique("books_db_isbn10_key").on(table.isbn10),
	unique("books_db_isbn13_key").on(table.isbn13),
]);

export const sessions = pgTable("sessions", {
	id: serial().primaryKey().notNull(),
	userId: integer().notNull(),
	expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	sessionToken: varchar({ length: 255 }).notNull(),
}, (table) => [
	index("idx_sessions_expires").using("btree", table.expires.asc().nullsLast()),
	index("idx_sessions_token").using("btree", table.sessionToken.asc().nullsLast()),
	index("idx_sessions_user_id").using("btree", table.userId.asc().nullsLast()),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }),
	email: varchar({ length: 255 }),
	emailVerified: timestamp({ withTimezone: true, mode: 'string' }),
	image: text(),
}, (table) => [
	index("idx_users_email").using("btree", table.email.asc().nullsLast()),
]);

export const books = pgTable("books", {
	id: serial().primaryKey().notNull(),
	title: varchar({ length: 255 }).notNull(),
	authors: text().notNull(),
	isbn10: varchar({ length: 10 }),
	isbn13: varchar({ length: 13 }),
	count: integer().default(0).notNull(),
	borrowedCount: integer("borrowed_count").default(0).notNull(),
}, (table) => [
	index("idx_books_id_title").using("btree", table.id.asc().nullsLast(), table.title.asc().nullsLast()),
	index("idx_books_isbn10").using("btree", table.isbn10.asc().nullsLast()),
	index("idx_books_isbn13").using("btree", table.isbn13.asc().nullsLast()),
	index("idx_books_title").using("btree", table.title.asc().nullsLast()),
	index("idx_books_title_gin").using("gin", table.title.asc().nullsLast().op("gin_trgm_ops")),
	unique("books_isbn10_key").on(table.isbn10),
	unique("books_isbn13_key").on(table.isbn13),
	check("books_counts_check", sql`borrowed_count >= 0 AND borrowed_count <= count`),
	check("books_has_isbn_check", sql`isbn10 IS NOT NULL OR isbn13 IS NOT NULL`),
]);

export const bookCopies = pgTable("book_copies", {
	id: serial().primaryKey().notNull(),
	bookId: integer("book_id").notNull(),
	borrowed: boolean().default(false).notNull(),
	qrCode: text("qr_code").notNull(),
}, (table) => [
	index("idx_book_copies_book_id").using("btree", table.bookId.asc().nullsLast()),
	index("idx_book_copies_borrowed").using("btree", table.borrowed.asc().nullsLast()),
	index("idx_book_copies_qr_code").using("btree", table.qrCode.asc().nullsLast()),
	foreignKey({
			columns: [table.bookId],
			foreignColumns: [books.id],
			name: "book_copies_book_id_fkey"
		}).onDelete("cascade"),
	unique("book_copies_qr_code_key").on(table.qrCode),
]);

export const verificationToken = pgTable("verification_token", {
	identifier: text().notNull(),
	expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	token: text().notNull(),
}, (table) => [
	index("idx_verification_token_expires").using("btree", table.expires.asc().nullsLast()),
	index("idx_verification_token_identifier").using("btree", table.identifier.asc().nullsLast()),
	primaryKey({ columns: [table.identifier, table.token], name: "verification_token_pkey"}),
]);
