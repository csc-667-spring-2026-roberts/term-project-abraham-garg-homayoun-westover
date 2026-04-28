export const up = (pgm) => {
  pgm.createTable("games", {
    id: { type: "serial", primaryKey: true },
    host_user_id: {
    type: "integer",
    notNull: true,
    references: "users(id)",
    onDelete: "CASCADE",
    },
    status: { type: "text", notNull: true, default: "waiting" },
    current_player_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "SET NULL",
    },
    winning_team: { type: "integer" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
    updated_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.createTable("game_players", {
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE",
    },
    game_id: {
      type: "integer",
      notNull: true,
      references: "games(id)",
      onDelete: "CASCADE",
    },
    seat_position: { type: "integer", notNull: true },
    team_number: { type: "integer", notNull: true },
    joined_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("game_players", "game_players_pkey", "PRIMARY KEY (user_id, game_id)");

  pgm.createTable("cards", {
    id: { type: "serial", primaryKey: true },
    game_id: {
      type: "integer",
      notNull: true,
      references: "games(id)",
      onDelete: "CASCADE",
    },
    user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "SET NULL",
    },
    suit: { type: "text", notNull: true },
    rank: { type: "text", notNull: true },
    is_played: { type: "boolean", notNull: true, default: false },
    played_at: { type: "timestamptz" },
  });

  pgm.createTable("moves", {
    id: { type: "serial", primaryKey: true },
    game_id: {
      type: "integer",
      notNull: true,
      references: "games(id)",
      onDelete: "CASCADE",
    },
    user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "SET NULL",
    },
    move_type: { type: "text", notNull: true },
    card_played: { type: "text" },
    move_order: { type: "integer", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });

  pgm.createTable("game_messages", {
    id: { type: "serial", primaryKey: true },
    game_id: {
      type: "integer",
      notNull: true,
      references: "games(id)",
      onDelete: "CASCADE",
    },
    user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "SET NULL",
    },
    message: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
};

export const down = (pgm) => {
  pgm.dropTable("game_messages");
  pgm.dropTable("moves");
  pgm.dropTable("cards");
  pgm.dropTable("game_players");
  pgm.dropTable("games");
};
