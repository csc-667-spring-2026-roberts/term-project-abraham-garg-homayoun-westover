import express from "express";
import db from "../db/connection.js";
import { broadcastToRoom } from "../lib/sseBroker.js";

interface GameRow {
  id: number;
  host_user_id: number;
  created_at: Date;
}

const router = express.Router();

router.post("/games", async (req, res) => {
  const userId = req.session.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const game = await db.one<GameRow>(
      `INSERT INTO games (host_user_id)
       VALUES ($1)
       RETURNING *`,
      [userId],
    );

    const payload = {
      gameId: game.id,
      type: "game_created" as const,
      game,
    };

    broadcastToRoom(String(game.id), "state-update", payload);
    broadcastToRoom("global", "state-update", payload);

    return res.json(game);
  } catch (error) {
    console.error("Failed to create game:", error);
    return res.status(500).json({ error: "Failed to create game" });
  }
});

export default router;
