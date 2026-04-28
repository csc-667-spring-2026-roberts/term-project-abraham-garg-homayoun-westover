import "dotenv/config";
import pgPromise from "pg-promise";

import { KEEPALIVE_INTERVAL_MS } from "../lib/timing.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required but was not found in environment.");
}

/**
 * Shared options for PostgreSQL clients/pools. TCP keep-alive reduces idle
 * disconnects through managed DBs, proxies, or NAT (e.g. Render ↔ hosted Postgres).
 */
export const pgConnectionOptions = {
  connectionString,
  keepAlive: true as const,
  keepAliveInitialDelayMillis: KEEPALIVE_INTERVAL_MS,
};

const pgp = pgPromise({});
const db = pgp(pgConnectionOptions);

export default db;
