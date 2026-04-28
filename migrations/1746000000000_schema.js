export const up = (pgm) => {
  pgm.createTable("users", {
    id: { type: "serial", primaryKey: true },
    username: { type: "text", notNull: true },
    email: { type: "text", notNull: true, unique: true },
    password_hash: { type: "text", notNull: true },
    created_at: {           // ← add this
      type: "timestamptz",
      notNull: true,
      default: pgm.func("NOW()"),
    },
  });

  pgm.createTable("test_data", {
    id: { type: "serial", primaryKey: true },
    message: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.createTable("session", {
    sid: { type: "varchar", primaryKey: true },
    sess: { type: "json", notNull: true },
    expire: { type: "timestamp(6)", notNull: true },
  });

  pgm.createIndex("session", "expire", { name: "IDX_session_expire" });
};

export const down = (pgm) => {
  pgm.dropTable("session");
  pgm.dropTable("test_data");
  pgm.dropTable("users");
};