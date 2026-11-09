import path from "node:path";
import { defineConfig } from "vitest/config";

const r = (p: string) => path.resolve(__dirname, p);

// Real-Postgres tests. Needs `docker compose up -d postgres` (host port 5433).
export default defineConfig({
    resolve: {
        alias: [
            { find: /^@\/components\//, replacement: r("components") + "/" },
            { find: /^@\/styles\//, replacement: r("styles") + "/" },
            { find: /^@\/types\//, replacement: r("types") + "/" },
            { find: /^@\/utils\//, replacement: r("utils") + "/" },
            { find: /^@\//, replacement: r("src") + "/" },
        ],
    },
    test: {
        environment: "node",
        include: ["**/*.integration.test.ts"],
        exclude: ["node_modules/**", ".next/**"],
        globalSetup: ["./test/integration/global-setup.ts"],
        setupFiles: ["./test/integration/setup.ts"],
        // One shared database: files must not run at the same time.
        fileParallelism: false,
        testTimeout: 20000,
        hookTimeout: 60000,
    },
});
