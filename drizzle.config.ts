import { defineConfig } from "drizzle-kit";


export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Drizzle Kit connects directly (no pooler) to avoid pooled-session issues.
    url: process.env.DATABASE_URL!.replace("-pooler", ""),
  },
});
