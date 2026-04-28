import express from "express";
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
    // seats 0,2 = team 1; seats 1,3 = team 2
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

    if (players.length < 2) {
      return res.status(400).json({ error: "Need at least 2 players to start" });
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

    // players.length >= 2 verified above
    const firstPlayer = players[0];
    if (!firstPlayer) {
      return res.status(400).json({ error: "No players found" });
    }
    await db.none(
      `UPDATE games SET status = 'playing', current_player_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [firstPlayer.user_id, gameId],
    );

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

router.post("/games/:id/play", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const gameId = parseInt(req.params.id, 10);
  const { cardId } = req.body as { cardId: number };

  if (!cardId) {
    return res.status(400).json({ error: "cardId is required" });
  }

  try {
    const game = await db.oneOrNone<GameRow>(`SELECT * FROM games WHERE id = $1`, [gameId]);

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    if (game.status !== "playing") {
      return res.status(400).json({ error: "Game is not in progress" });
    }
    if (game.current_player_id !== userId) {
      return res.status(403).json({ error: "Not your turn" });
    }

    const card = await db.oneOrNone<CardRow>(`SELECT * FROM cards WHERE id = $1 AND game_id = $2`, [
      cardId,
      gameId,
    ]);

    if (!card) {
      return res.status(404).json({ error: "Card not found" });
    }
    if (card.user_id !== userId) {
      return res.status(403).json({ error: "That card is not yours" });
    }
    if (card.is_played) {
      return res.status(400).json({ error: "Card already played" });
    }

    await db.none(`UPDATE cards SET is_played = true, played_at = NOW() WHERE id = $1`, [cardId]);

    const moveCount = await db.one<{ count: string }>(
      `SELECT COUNT(*) FROM moves WHERE game_id = $1`,
      [gameId],
    );

    await db.none(
      `INSERT INTO moves (game_id, user_id, move_type, card_played, move_order)
       VALUES ($1, $2, 'play_card', $3, $4)`,
      [gameId, userId, `${card.rank} of ${card.suit}`, parseInt(moveCount.count, 10) + 1],
    );

    // Advance turn to next player by seat_position
    const players = await db.any<GamePlayerRow>(
      `SELECT * FROM game_players WHERE game_id = $1 ORDER BY seat_position`,
      [gameId],
    );

    const currentIndex = players.findIndex((p) => p.user_id === userId);
    // players list is non-empty (user is in the game), modulo keeps index in bounds
    const nextPlayer = players[(currentIndex + 1) % players.length];
    if (!nextPlayer) {
      return res.status(500).json({ error: "Failed to determine next player" });
    }

    await db.none(`UPDATE games SET current_player_id = $1, updated_at = NOW() WHERE id = $2`, [
      nextPlayer.user_id,
      gameId,
    ]);

    const payload = {
      type: "card_played" as const,
      gameId,
      userId,
      cardId,
      suit: card.suit,
      rank: card.rank,
      nextPlayerId: nextPlayer.user_id,
    };
    broadcastToRoom(String(gameId), "state-update", payload);

    return res.json(payload);
  } catch (error) {
    console.error("Failed to play card:", error);
    return res.status(500).json({ error: "Failed to play card" });
  }
});

router.get("/games/:id/state", async (req, res) => {
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
       ORDER BY suit, rank`,
      [gameId, userId],
    );

    const playedCards = await db.any<CardRow>(
      `SELECT * FROM cards WHERE game_id = $1 AND is_played = true
       ORDER BY played_at`,
      [gameId],
    );

    return res.json({ game, players, myCards, playedCards });
  } catch (error) {
    console.error("Failed to fetch game state:", error);
    return res.status(500).json({ error: "Failed to fetch game state" });
  }
});

export default router;
