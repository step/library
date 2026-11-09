import './neon-local';
import { Pool } from '@neondatabase/serverless';


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pool: any = new Pool({
    connectionString: process.env.DATABASE_URL,
});