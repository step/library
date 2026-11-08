-- Issue 5: two user systems. library_users stays the app's identity; the NextAuth tables are
-- linked to it by email and now enforce their own integrity.
-- 1) Remove NextAuth users whose library_users row was deleted. Their accounts and sessions go with
--    them once the cascading FKs exist (dev: users 72 and 94, expired sessions only). Run first so
--    nothing is left behind.
DELETE FROM "sessions" WHERE "userId" IN (SELECT u."id" FROM "users" u WHERE NOT EXISTS (SELECT 1 FROM "library_users" l WHERE l."email" = u."email"));--> statement-breakpoint
DELETE FROM "accounts" WHERE "userId" IN (SELECT u."id" FROM "users" u WHERE NOT EXISTS (SELECT 1 FROM "library_users" l WHERE l."email" = u."email"));--> statement-breakpoint
DELETE FROM "users" u WHERE NOT EXISTS (SELECT 1 FROM "library_users" l WHERE l."email" = u."email");--> statement-breakpoint
-- 2) Constraints. The redundant plain indexes are replaced by the unique constraints' own indexes.
DROP INDEX "idx_accounts_provider";--> statement-breakpoint
DROP INDEX "idx_sessions_token";--> statement-breakpoint
DROP INDEX "idx_users_email";--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_provider_key" UNIQUE("provider","providerAccountId");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_session_token_key" UNIQUE("sessionToken");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE("email");