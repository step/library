// Stand-in for @neondatabase/serverless that talks to plain Postgres with `pg`.
// The app code is unchanged: it still calls neon`...` and new Pool(), and the SQL really runs.
import pg from "pg";

const pools: pg.Pool[] = [];

export class Pool extends pg.Pool {
    constructor(config?: pg.PoolConfig) {
        super(config);
        pools.push(this);
    }
}

export const neonConfig = {};

export const neon = (connectionString: string) => {
    const pool = new Pool({ connectionString });
    return async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
        const result = await pool.query(text, values.map(v => (v === undefined ? null : v)));
        return result.rows;
    };
};

export const closeAllPools = async () => {
    await Promise.all(pools.splice(0).map(p => p.end().catch(() => {})));
};
