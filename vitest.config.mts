import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
    plugins: [react()],
    // Mirrors tsconfig.json "paths". Specific aliases must come before "@/".
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
        environment: "jsdom",
        setupFiles: ["./vitest.setup.ts"],
        include: ["**/*.test.{ts,tsx}"],
        exclude: ["node_modules/**", ".next/**", "**/*.integration.test.ts"],
        css: false,
    },
});
