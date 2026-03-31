import db from "./connection.js";

const createUsersTableSql = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const createSessionTableSql = `
  CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL
  );
`;

const addSessionPrimaryKeySql = `
  ALTER TABLE "session"
  ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");
`;

const createSessionExpireIndexSql = `
  CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
`;

const createGamesTableSql = `
  CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    host_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'waiting',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const ensureAuthTables = async (): Promise<void> => {
  await db.none(createUsersTableSql);
  await db.none(createSessionTableSql);
  await db.none(createGamesTableSql);

  try {
    await db.none(addSessionPrimaryKeySql);
  } catch (error: unknown) {
    const isDuplicatePrimaryKey =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "42P16";

    if (!isDuplicatePrimaryKey) {
      throw error;
    }
  }

  await db.none(createSessionExpireIndexSql);
};

export default ensureAuthTables;
