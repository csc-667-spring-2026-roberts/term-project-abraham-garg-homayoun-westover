import express from "express";
import type { Request, Response } from "express";
import type { ITask } from "pg-promise";
import db from "../db/connection.js";
import { broadcastToRoom } from "../lib/sseBroker.js";
import { buildDeck, fisherYatesShuffle } from "../lib/deck.js";

const router = express.Router();

interface GameRow {
  id: number;
  status: string;
  host_user_id: number;
  current_player_id: number | null;
  winning_team: number | null;
  current_round: number;
  current_trick: number;
  spades_broken: boolean;
  lead_suit: string | null;
  trick_leader_id: number | null;
  created_at: Date;
  updated_at: Date;
}

interface GamePlayerRow {
  user_id: number;
  game_id: number;
  seat_position: number;
  team_number: number;
  joined_at: Date;
}

interface CardRow {
  id: number;
  game_id: number;
  user_id: number | null;
  suit: string;
  rank: string;
  is_played: boolean;
  played_at: Date | null;
}

interface TrickRow {
  id: number;
  game_id: number;
  round_number: number;
  trick_number: number;
  winner_user_id: number | null;
  lead_suit: string | null;
  completed_at: Date | null;
}

interface TrickCardRow {
  id: number;
  trick_id: number;
  card_id: number;
  user_id: number;
  play_order: number;
  suit: string;
  rank: string;
}

const RANK_ORDER: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

function determineTrickWinner(
  trickCards: Array<{ user_id: number; suit: string; rank: string }>,
  leadSuit: string,
): number {
  const spadesPlayed = trickCards.filter((c) => c.suit === "spades");
  if (spadesPlayed.length > 0) {
    return spadesPlayed.reduce((best, c) =>
      (RANK_ORDER[c.rank] ?? 0) > (RANK_ORDER[best.rank] ?? 0) ? c : best,
    ).user_id;
  }
  const leadSuitCards = trickCards.filter((c) => c.suit === leadSuit);
  return leadSuitCards.reduce((best, c) =>
    (RANK_ORDER[c.rank] ?? 0) > (RANK_ORDER[best.rank] ?? 0) ? c : best,
  ).user_id;
}

function getNextPlayerBySeat(players: GamePlayerRow[], currentUserId: number): GamePlayerRow {
  const currentIndex = players.findIndex((p) => p.user_id === currentUserId);
  const result = players[(currentIndex + 1) % players.length];
  if (!result) throw new Error("Player not found");
  return result;
}

function getNextPlayerFromLeader(
  players: GamePlayerRow[],
  leaderId: number,
  cardsPlayed: number,
): GamePlayerRow {
  const leaderIndex = players.findIndex((p) => p.user_id === leaderId);
  const result = players[(leaderIndex + cardsPlayed) % players.length];
  if (!result) throw new Error("Player index out of bounds");
  return result;
}

async function advanceAfterBid(
  gameId: number,
  players: GamePlayerRow[],
  userId: number,
  currentRound: number,
  amount: number,
): Promise<void> {
  const bidCount = await db.one<{ count: string }>(
    `SELECT COUNT(*) FROM bids WHERE game_id = $1 AND round_number = $2`,
    [gameId, currentRound],
  );
  const allBidsIn = parseInt(bidCount.count, 10) >= players.length;

  if (allBidsIn) {
    const leader = players[0];
    if (!leader) throw new Error("No players found");
    await db.none(
      `UPDATE games
       SET status = 'playing', current_player_id = $1, trick_leader_id = $1,
           lead_suit = NULL, updated_at = NOW()
       WHERE id = $2`,
      [leader.user_id, gameId],
    );
    broadcastToRoom(String(gameId), "state-update", {
      type: "bidding_complete" as const,
      gameId,
      currentPlayerId: leader.user_id,
    });
  } else {
    const nextPlayer = getNextPlayerBySeat(players, userId);
    await db.none(`UPDATE games SET current_player_id = $1, updated_at = NOW() WHERE id = $2`, [
      nextPlayer.user_id,
      gameId,
    ]);
    broadcastToRoom(String(gameId), "state-update", {
      type: "bid_placed" as const,
      gameId,
      userId,
      amount,
      nextPlayerId: nextPlayer.user_id,
    });
  }
}

async function validateCardRules(
  t: ITask<unknown>,
  game: GameRow,
  card: CardRow,
  userId: number,
  gameId: number,
): Promise<string | null> {
  const isLeading = game.lead_suit === null;
  if (isLeading && card.suit === "spades" && !game.spades_broken) {
    const nonSpades = await t.oneOrNone(
      `SELECT 1 FROM cards WHERE game_id=$1 AND user_id=$2 AND is_played=false AND suit != 'spades' LIMIT 1`,
      [gameId, userId],
    );
    if (nonSpades) return "Spades have not been broken yet";
  }
  if (!isLeading) {
    const hasSuit = await t.oneOrNone(
      `SELECT 1 FROM cards WHERE game_id=$1 AND user_id=$2 AND is_played=false AND suit=$3 LIMIT 1`,
      [gameId, userId, game.lead_suit],
    );
    if (hasSuit && card.suit !== game.lead_suit) return "You must follow suit";
  }
  return null;
}

async function applyCardToTrick(
  t: ITask<unknown>,
  cardId: number,
  card: CardRow,
  userId: number,
  gameId: number,
  isLeading: boolean,
  game: GameRow,
): Promise<{ trick: TrickRow; playOrder: number; currentLeadSuit: string }> {
  await t.none(`UPDATE cards SET is_played = true, played_at = NOW() WHERE id = $1`, [cardId]);

  const moveCount = await t.one<{ count: string }>(
    `SELECT COUNT(*) FROM moves WHERE game_id = $1`,
    [gameId],
  );
  await t.none(
    `INSERT INTO moves (game_id, user_id, move_type, card_played, move_order)
     VALUES ($1, $2, 'play_card', $3, $4)`,
    [gameId, userId, `${card.rank} of ${card.suit}`, parseInt(moveCount.count, 10) + 1],
  );

  const trick = await t.one<TrickRow>(
    `SELECT * FROM tricks WHERE game_id = $1 AND round_number = $2 AND trick_number = $3`,
    [gameId, game.current_round, game.current_trick],
  );
  const trickCardCount = await t.one<{ count: string }>(
    `SELECT COUNT(*) FROM trick_cards WHERE trick_id = $1`,
    [trick.id],
  );
  const playOrder = parseInt(trickCardCount.count, 10) + 1;
  await t.none(
    `INSERT INTO trick_cards (trick_id, card_id, user_id, play_order) VALUES ($1, $2, $3, $4)`,
    [trick.id, cardId, userId, playOrder],
  );

  const currentLeadSuit = isLeading ? card.suit : (game.lead_suit ?? card.suit);
  if (isLeading) {
    await t.none(`UPDATE games SET lead_suit = $1, updated_at = NOW() WHERE id = $2`, [
      card.suit,
      gameId,
    ]);
    await t.none(`UPDATE tricks SET lead_suit = $1 WHERE id = $2`, [card.suit, trick.id]);
  }
  if (card.suit === "spades" && currentLeadSuit !== "spades" && !game.spades_broken) {
    await t.none(`UPDATE games SET spades_broken = true WHERE id = $1`, [gameId]);
  }

  return { trick, playOrder, currentLeadSuit };
}

async function completeRoundLogic(t: ITask<unknown>, game: GameRow, gameId: number): Promise<void> {
  const team1Tricks = await t.one<{ count: string }>(
    `SELECT COUNT(*) FROM tricks tr
     JOIN game_players gp ON gp.user_id = tr.winner_user_id AND gp.game_id = tr.game_id
     WHERE tr.game_id = $1 AND tr.round_number = $2 AND gp.team_number = 1`,
    [gameId, game.current_round],
  );
  const team2Tricks = await t.one<{ count: string }>(
    `SELECT COUNT(*) FROM tricks tr
     JOIN game_players gp ON gp.user_id = tr.winner_user_id AND gp.game_id = tr.game_id
     WHERE tr.game_id = $1 AND tr.round_number = $2 AND gp.team_number = 2`,
    [gameId, game.current_round],
  );
  const team1Bids = await t.one<{ total: string }>(
    `SELECT COALESCE(SUM(b.bid_amount), 0) AS total
     FROM bids b
     JOIN game_players gp ON gp.user_id = b.user_id AND gp.game_id = b.game_id
     WHERE b.game_id = $1 AND b.round_number = $2 AND gp.team_number = 1`,
    [gameId, game.current_round],
  );
  const team2Bids = await t.one<{ total: string }>(
    `SELECT COALESCE(SUM(b.bid_amount), 0) AS total
     FROM bids b
     JOIN game_players gp ON gp.user_id = b.user_id AND gp.game_id = b.game_id
     WHERE b.game_id = $1 AND b.round_number = $2 AND gp.team_number = 2`,
    [gameId, game.current_round],
  );

  const t1Won = parseInt(team1Tricks.count, 10);
  const t2Won = parseInt(team2Tricks.count, 10);
  const t1Bid = parseInt(team1Bids.total, 10);
  const t2Bid = parseInt(team2Bids.total, 10);
  const t1Score = t1Won >= t1Bid ? t1Bid * 10 + (t1Won - t1Bid) : t1Bid * -10;
  const t2Score = t2Won >= t2Bid ? t2Bid * 10 + (t2Won - t2Bid) : t2Bid * -10;

  await t.none(
    `INSERT INTO scores (game_id, round_number, team_number, tricks_won, team_bid, round_score, total_score)
     VALUES ($1, $2, 1, $3, $4, $5, $5)`,
    [gameId, game.current_round, t1Won, t1Bid, t1Score],
  );
  await t.none(
    `INSERT INTO scores (game_id, round_number, team_number, tricks_won, team_bid, round_score, total_score)
     VALUES ($1, $2, 2, $3, $4, $5, $5)`,
    [gameId, game.current_round, t2Won, t2Bid, t2Score],
  );
  await t.none(`UPDATE games SET status = 'finished', updated_at = NOW() WHERE id = $1`, [gameId]);
  broadcastToRoom(String(gameId), "state-update", {
    type: "round_completed" as const,
    gameId,
    roundNumber: game.current_round,
    team1Score: t1Score,
    team2Score: t2Score,
  });
}

async function completeTrickLogic(
  t: ITask<unknown>,
  trick: TrickRow,
  currentLeadSuit: string,
  game: GameRow,
  gameId: number,
): Promise<void> {
  const allTrickCards = await t.any<TrickCardRow>(
    `SELECT tc.*, c.suit, c.rank
     FROM trick_cards tc
     JOIN cards c ON c.id = tc.card_id
     WHERE tc.trick_id = $1
     ORDER BY tc.play_order`,
    [trick.id],
  );
  const winnerId = determineTrickWinner(allTrickCards, currentLeadSuit);
  await t.none(`UPDATE tricks SET winner_user_id = $1, completed_at = NOW() WHERE id = $2`, [
    winnerId,
    trick.id,
  ]);

  const nextTrick = game.current_trick + 1;
  if (nextTrick > 13) {
    await completeRoundLogic(t, game, gameId);
  } else {
    await t.none(
      `UPDATE games
       SET current_trick = $1, current_player_id = $2, trick_leader_id = $2,
           lead_suit = NULL, updated_at = NOW()
       WHERE id = $3`,
      [nextTrick, winnerId, gameId],
    );
    await t.none(`INSERT INTO tricks (game_id, round_number, trick_number) VALUES ($1, $2, $3)`, [
      gameId,
      game.current_round,
      nextTrick,
    ]);
    broadcastToRoom(String(gameId), "state-update", {
      type: "trick_completed" as const,
      gameId,
      trickNumber: game.current_trick,
      winnerId,
      nextPlayerId: winnerId,
    });
  }
}

async function fetchGameState(
  gameId: number,
  userId: number,
): Promise<Record<string, unknown> | null> {
  const game = await db.oneOrNone<GameRow>(`SELECT * FROM games WHERE id = $1`, [gameId]);
  if (!game) return null;

  const players = await db.any<GamePlayerRow & { username: string }>(
    `SELECT gp.*, u.username
     FROM game_players gp
     JOIN users u ON u.id = gp.user_id
     WHERE gp.game_id = $1
     ORDER BY gp.seat_position`,
    [gameId],
  );
  const myCards = await db.any<CardRow>(
    `SELECT * FROM cards WHERE game_id = $1 AND user_id = $2 AND is_played = false
     ORDER BY suit,
       CASE rank
         WHEN '2' THEN 2 WHEN '3' THEN 3 WHEN '4' THEN 4 WHEN '5' THEN 5
         WHEN '6' THEN 6 WHEN '7' THEN 7 WHEN '8' THEN 8 WHEN '9' THEN 9
         WHEN '10' THEN 10 WHEN 'J' THEN 11 WHEN 'Q' THEN 12 WHEN 'K' THEN 13
         WHEN 'A' THEN 14 END`,
    [gameId, userId],
  );
  const playedCards = await db.any<CardRow>(
    `SELECT * FROM cards WHERE game_id = $1 AND is_played = true ORDER BY played_at`,
    [gameId],
  );
  const bids = await db.any(
    `SELECT b.user_id, b.bid_amount, gp.seat_position, u.username
     FROM bids b
     JOIN game_players gp ON gp.user_id = b.user_id AND gp.game_id = b.game_id
     JOIN users u ON u.id = b.user_id
     WHERE b.game_id = $1 AND b.round_number = $2
     ORDER BY gp.seat_position`,
    [gameId, game.current_round],
  );
  const currentTrick = await db.oneOrNone<TrickRow>(
    `SELECT * FROM tricks WHERE game_id = $1 AND round_number = $2 AND trick_number = $3`,
    [gameId, game.current_round, game.current_trick],
  );
  let currentTrickCards: unknown[] = [];
  if (currentTrick) {
    currentTrickCards = await db.any(
      `SELECT tc.user_id, tc.play_order, c.suit, c.rank, u.username
       FROM trick_cards tc
       JOIN cards c ON c.id = tc.card_id
       JOIN users u ON u.id = tc.user_id
       WHERE tc.trick_id = $1
       ORDER BY tc.play_order`,
      [currentTrick.id],
    );
  }
  const scores = await db.any(
    `SELECT * FROM scores WHERE game_id = $1 ORDER BY round_number, team_number`,
    [gameId],
  );
  const tricksTaken = await db.any(
    `SELECT gp.team_number, COUNT(*)::int AS tricks_won
     FROM tricks tr
     JOIN game_players gp ON gp.user_id = tr.winner_user_id AND gp.game_id = tr.game_id
     WHERE tr.game_id = $1 AND tr.round_number = $2 AND tr.winner_user_id IS NOT NULL
     GROUP BY gp.team_number`,
    [gameId, game.current_round],
  );

  return { game, players, myCards, playedCards, bids, currentTrickCards, scores, tricksTaken };
}

async function playCardTxBody(
  t: ITask<unknown>,
  res: Response,
  gameId: number,
  userId: number,
  cardId: number,
): Promise<void> {
  const game = await t.oneOrNone<GameRow>(`SELECT * FROM games WHERE id = $1 FOR UPDATE`, [gameId]);
  if (!game) return res.status(404).json({ error: "Game not found" });
  if (game.status !== "playing")
    return res.status(400).json({ error: "Game is not in play phase" });
  if (game.current_player_id !== userId) return res.status(403).json({ error: "Not your turn" });

  const card = await t.oneOrNone<CardRow>(`SELECT * FROM cards WHERE id = $1 AND game_id = $2`, [
    cardId,
    gameId,
  ]);
  if (!card) return res.status(404).json({ error: "Card not found" });
  if (card.user_id !== userId) return res.status(403).json({ error: "That card is not yours" });
  if (card.is_played) return res.status(400).json({ error: "Card already played" });

  const ruleError = await validateCardRules(t, game, card, userId, gameId);
  if (ruleError) return res.status(400).json({ error: ruleError });

  const isLeading = game.lead_suit === null;
  const { trick, playOrder, currentLeadSuit } = await applyCardToTrick(
    t,
    cardId,
    card,
    userId,
    gameId,
    isLeading,
    game,
  );

  const players = await t.any<GamePlayerRow>(
    `SELECT * FROM game_players WHERE game_id = $1 ORDER BY seat_position`,
    [gameId],
  );

  if (playOrder >= players.length) {
    await completeTrickLogic(t, trick, currentLeadSuit, game, gameId);
  } else {
    if (!game.trick_leader_id) return res.status(500).json({ error: "No trick leader" });
    const nextPlayer = getNextPlayerFromLeader(players, game.trick_leader_id, playOrder);
    await t.none(`UPDATE games SET current_player_id = $1, updated_at = NOW() WHERE id = $2`, [
      nextPlayer.user_id,
      gameId,
    ]);
    broadcastToRoom(String(gameId), "state-update", {
      type: "card_played" as const,
      gameId,
      userId,
      cardId,
      suit: card.suit,
      rank: card.rank,
      nextPlayerId: nextPlayer.user_id,
    });
  }

  return res.json({ gameId, userId, cardId, suit: card.suit, rank: card.rank });
}

// List waiting games
router.get("/games", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const games = await db.any<GameRow & { player_count: number }>(
      `SELECT g.*, COUNT(gp.user_id)::int AS player_count
       FROM games g
       LEFT JOIN game_players gp ON gp.game_id = g.id
       WHERE g.status = 'waiting'
       GROUP BY g.id
       ORDER BY g.created_at DESC`,
    );
    return res.json(games);
  } catch (error) {
    console.error("Failed to fetch games:", error);
    return res.status(500).json({ error: "Failed to fetch games" });
  }
});

// Create game
router.post("/games", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const game = await db.one<GameRow>(
      `INSERT INTO games (status, host_user_id) VALUES ('waiting', $1) RETURNING *`,
      [userId],
    );

    await db.none(
      `INSERT INTO game_players (user_id, game_id, seat_position, team_number)
       VALUES ($1, $2, 0, 1)`,
      [userId, game.id],
    );

    const payload = { type: "game_created" as const, gameId: game.id, game };
    broadcastToRoom("global", "state-update", payload);

    return res.json(game);
  } catch (error) {
    console.error("Failed to create game:", error);
    return res.status(500).json({ error: "Failed to create game" });
  }
});

// Join game
router.post("/games/:id/join", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const gameId = parseInt(req.params.id, 10);

  try {
    const game = await db.oneOrNone<GameRow>(`SELECT * FROM games WHERE id = $1`, [gameId]);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    if (game.status !== "waiting") {
      return res.status(400).json({ error: "Game already started" });
    }

    const players = await db.any<GamePlayerRow>(
      `SELECT * FROM game_players WHERE game_id = $1 ORDER BY seat_position`,
      [gameId],
    );

    if (players.some((p) => p.user_id === userId)) {
      return res.status(400).json({ error: "Already in this game" });
    }
    if (players.length >= 4) {
      return res.status(400).json({ error: "Game is full" });
    }

    const seatPosition = players.length;
    const teamNumber = seatPosition % 2 === 0 ? 1 : 2;

    await db.none(
      `INSERT INTO game_players (user_id, game_id, seat_position, team_number)
       VALUES ($1, $2, $3, $4)`,
      [userId, gameId, seatPosition, teamNumber],
    );

    const payload = { type: "player_joined" as const, gameId, userId, seatPosition };
    broadcastToRoom(String(gameId), "state-update", payload);

    return res.json({ gameId, seatPosition, teamNumber });
  } catch (error) {
    console.error("Failed to join game:", error);
    return res.status(500).json({ error: "Failed to join game" });
  }
});

// Start game — transitions to bidding phase
router.post("/games/:id/start", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const gameId = parseInt(req.params.id, 10);

  try {
    const game = await db.oneOrNone<GameRow>(`SELECT * FROM games WHERE id = $1`, [gameId]);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    if (game.status !== "waiting") {
      return res.status(400).json({ error: "Game already started" });
    }

    const players = await db.any<GamePlayerRow>(
      `SELECT * FROM game_players WHERE game_id = $1 ORDER BY seat_position`,
      [gameId],
    );

    if (players.length !== 4) {
      return res.status(400).json({ error: "Need exactly 4 players to start" });
    }
    if (!players.some((p) => p.user_id === userId)) {
      return res.status(403).json({ error: "You are not in this game" });
    }

    const deck = fisherYatesShuffle(buildDeck());

    const cardInserts = deck.flatMap((card, idx) => {
      const player = players[idx % players.length];
      if (!player) return [];
      return [
        db.none(`INSERT INTO cards (game_id, user_id, suit, rank) VALUES ($1, $2, $3, $4)`, [
          gameId,
          player.user_id,
          card.suit,
          card.rank,
        ]),
      ];
    });
    await Promise.all(cardInserts);

    const firstPlayer = players[0];
    if (!firstPlayer) return res.status(500).json({ error: "No players found" });

    await db.none(
      `UPDATE games
       SET status = 'bidding', current_player_id = $1,
           current_round = 1, current_trick = 1,
           spades_broken = false, lead_suit = NULL, trick_leader_id = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [firstPlayer.user_id, gameId],
    );

    await db.none(`INSERT INTO tricks (game_id, round_number, trick_number) VALUES ($1, 1, 1)`, [
      gameId,
    ]);

    const payload = {
      type: "game_started" as const,
      gameId,
      currentPlayerId: firstPlayer.user_id,
    };
    broadcastToRoom(String(gameId), "state-update", payload);

    return res.json({ gameId, currentPlayerId: firstPlayer.user_id });
  } catch (error) {
    console.error("Failed to start game:", error);
    return res.status(500).json({ error: "Failed to start game" });
  }
});

// Place a bid
router.post("/games/:id/bid", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const gameId = parseInt(req.params.id, 10);
  const { amount } = req.body as { amount: unknown };

  if (!Number.isInteger(amount) || (amount as number) < 0 || (amount as number) > 13) {
    return res.status(400).json({ error: "Bid must be an integer from 0 to 13" });
  }
  const bidAmount = amount as number;

  try {
    const game = await db.oneOrNone<GameRow>(`SELECT * FROM games WHERE id = $1`, [gameId]);

    if (!game) return res.status(404).json({ error: "Game not found" });
    if (game.status !== "bidding") {
      return res.status(400).json({ error: "Game is not in bidding phase" });
    }
    if (game.current_player_id !== userId) {
      return res.status(403).json({ error: "Not your turn to bid" });
    }

    await db.none(
      `INSERT INTO bids (game_id, user_id, round_number, bid_amount) VALUES ($1, $2, $3, $4)`,
      [gameId, userId, game.current_round, bidAmount],
    );

    const moveCount = await db.one<{ count: string }>(
      `SELECT COUNT(*) FROM moves WHERE game_id = $1`,
      [gameId],
    );
    await db.none(
      `INSERT INTO moves (game_id, user_id, move_type, card_played, move_order)
       VALUES ($1, $2, 'bid', NULL, $3)`,
      [gameId, userId, parseInt(moveCount.count, 10) + 1],
    );

    const players = await db.any<GamePlayerRow>(
      `SELECT * FROM game_players WHERE game_id = $1 ORDER BY seat_position`,
      [gameId],
    );

    await advanceAfterBid(gameId, players, userId, game.current_round, bidAmount);
    return res.json({ gameId, userId, amount: bidAmount });
  } catch (error) {
    console.error("Failed to place bid:", error);
    return res.status(500).json({ error: "Failed to place bid" });
  }
});

// Play a card
async function playCardHandler(req: Request, res: Response): Promise<void> {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const gameId = parseInt(req.params.id, 10);
  const { cardId } = req.body as { cardId: number };

  if (!cardId) {
    res.status(400).json({ error: "cardId is required" });
    return;
  }

  try {
    await db.tx((t) => playCardTxBody(t, res, gameId, userId, cardId));
  } catch (error) {
    console.error("Failed to play card:", error);
    res.status(500).json({ error: "Failed to play card" });
  }
}

router.post("/games/:id/play", playCardHandler);

// Get game state
router.get("/games/:id/state", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const gameId = parseInt(req.params.id, 10);

  try {
    const state = await fetchGameState(gameId, userId);
    if (!state) return res.status(404).json({ error: "Game not found" });
    return res.json(state);
  } catch (error) {
    console.error("Failed to fetch game state:", error);
    return res.status(500).json({ error: "Failed to fetch game state" });
  }
});

export default router;
