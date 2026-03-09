import "dotenv/config";
import pgPromise from "pg-promise";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required but was not found in environment.");
}

const pgp = pgPromise({});
const db = pgp(connectionString);

export default db;
