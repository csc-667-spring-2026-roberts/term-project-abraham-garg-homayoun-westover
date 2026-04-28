import path from "node:path";
import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";

/**
 * Applies pending migrations before the server starts.
 * Keeps deployment correct even if the platform Start Command bypasses npm scripts (e.g. `node dist/server.js`).
 */
export async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required but was not found in environment.");
  }

  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

  await runner({
    direction: "up",
    databaseUrl,
    dir,
    migrationsTable: "pgmigrations",
    checkOrder: true,
    verbose: false,
  });
}
