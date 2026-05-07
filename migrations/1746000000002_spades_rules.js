export const up = (pgm) => {
  pgm.addColumns("games", {
    current_round: { type: "integer", notNull: true, default: 1 },
    current_trick: { type: "integer", notNull: true, default: 1 },
    spades_broken: { type: "boolean", notNull: true, default: false },
    lead_suit: { type: "text" },
    trick_leader_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "SET NULL",
    },
  });

  pgm.createTable("bids", {
    id: { type: "serial", primaryKey: true },
    game_id: {
      type: "integer",
      notNull: true,
      references: "games(id)",
      onDelete: "CASCADE",
    },
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE",
    },
    round_number: { type: "integer", notNull: true },
    bid_amount: { type: "integer", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("NOW()") },
  });
  pgm.addConstraint("bids", "bids_unique_player_round", "UNIQUE(game_id, user_id, round_number)");

  pgm.createTable("tricks", {
    id: { type: "serial", primaryKey: true },
    game_id: {
      type: "integer",
      notNull: true,
      references: "games(id)",
      onDelete: "CASCADE",
    },
    round_number: { type: "integer", notNull: true },
    trick_number: { type: "integer", notNull: true },
    winner_user_id: {
      type: "integer",
      references: "users(id)",
      onDelete: "SET NULL",
    },
    lead_suit: { type: "text" },
    completed_at: { type: "timestamptz" },
  });
  pgm.addConstraint("tricks", "tricks_unique_round_trick", "UNIQUE(game_id, round_number, trick_number)");

  pgm.createTable("trick_cards", {
    id: { type: "serial", primaryKey: true },
    trick_id: {
      type: "integer",
      notNull: true,
      references: "tricks(id)",
      onDelete: "CASCADE",
    },
    card_id: {
      type: "integer",
      notNull: true,
      references: "cards(id)",
      onDelete: "CASCADE",
    },
    user_id: {
      type: "integer",
      notNull: true,
      references: "users(id)",
      onDelete: "CASCADE",
    },
    play_order: { type: "integer", notNull: true },
  });
  pgm.addConstraint("trick_cards", "trick_cards_unique_order", "UNIQUE(trick_id, play_order)");

  pgm.createTable("scores", {
    id: { type: "serial", primaryKey: true },
    game_id: {
      type: "integer",
      notNull: true,
      references: "games(id)",
      onDelete: "CASCADE",
    },
    round_number: { type: "integer", notNull: true },
    team_number: { type: "integer", notNull: true },
    tricks_won: { type: "integer", notNull: true, default: 0 },
    team_bid: { type: "integer", notNull: true, default: 0 },
    round_score: { type: "integer", notNull: true, default: 0 },
    total_score: { type: "integer", notNull: true, default: 0 },
  });
  pgm.addConstraint("scores", "scores_unique_round_team", "UNIQUE(game_id, round_number, team_number)");
};

export const down = (pgm) => {
  pgm.dropTable("scores");
  pgm.dropTable("trick_cards");
  pgm.dropTable("tricks");
  pgm.dropTable("bids");
  pgm.dropColumns("games", [
    "current_round",
    "current_trick",
    "spades_broken",
    "lead_suit",
    "trick_leader_id",
  ]);
};
