// Adds (or promotes) the first admin so Google sign-in is allowed on a fresh database.
// Reads SEED_ADMIN_EMAIL / SEED_ADMIN_NAME; does nothing when no email is set.
import pg from 'pg';

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
if (!email) {
    console.log('SEED_ADMIN_EMAIL not set, skipping admin seed.');
    process.exit(0);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(
    `INSERT INTO library_users (name, email, is_admin, batch_id)
     VALUES ($1, $2, true, 1)
     ON CONFLICT (email) DO UPDATE SET is_admin = true`,
    [process.env.SEED_ADMIN_NAME?.trim() || 'Admin', email],
);
await client.end();
console.log(`Admin ready: ${email}`);
