import express from "express";
import db from "../db/connection.js";

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

  const game = await db.one<GameRow>(
    `INSERT INTO games (host_user_id)
     VALUES ($1)
     RETURNING *`,
    [userId],
  );

  return res.json(game);
});

export default router;
