import { neonConfig } from '@neondatabase/serverless';

/**
 * Lets the Neon serverless driver talk to a local Postgres through the
 * local-neon-http-proxy container (see docker-compose.yml).
 *
 * Only applies when DATABASE_URL points at LOCAL_DB_HOST, so deployed
 * environments keep using Neon's own endpoints. Import this module (for its
 * side effect) in every file that creates a neon() client or Pool.
 */
const LOCAL_DB_HOST = 'db.localtest.me'; // public DNS name that resolves to 127.0.0.1
const PROXY_PORT = 4444;

const isLocalDatabase = (() => {
    try {
        return new URL(process.env.DATABASE_URL ?? '').hostname === LOCAL_DB_HOST;
    } catch {
        return false;
    }
})();

if (isLocalDatabase) {
    neonConfig.fetchEndpoint = (host) => `http://${host}:${PROXY_PORT}/sql`;
    neonConfig.wsProxy = (host) => `${host}:${PROXY_PORT}/v2`;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineConnect = false;
}
