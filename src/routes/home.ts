import { Router } from "express";
import type { Request, Response } from "express";
import db from "../db/connection.js";
import requireAuth from "../middleware/requireAuth.js";

interface LobbyUserRow {
  id: number;
  username: string;
  email: string;
  created_at: Date;
}

const router = Router();

router.get("/", (request: Request, response: Response) => {
  if (request.session.userId) {
    response.redirect("/lobby");
    return;
  }

  response.redirect("/auth/login");
});

router.get("/lobby", requireAuth, async (request: Request, response: Response) => {
  const userId = request.session.userId;
  try {
    const user = await db.oneOrNone<LobbyUserRow>(
      "SELECT id, username, email, created_at FROM users WHERE id = $1",
      [userId],
    );

    if (!user) {
      request.session.destroy(() => {
        response.redirect("/auth/login");
      });
      return;
    }

    response.render("lobby", {
      title: "Lobby",
      user,
    });
  } catch {
    response.status(500).send("Failed to load lobby.");
  }
});

router.get("/game/:id", requireAuth, async (request: Request, response: Response) => {
  const userId = request.session.userId;
  const gameId = parseInt(request.params["id"] as string, 10);

  if (isNaN(gameId)) {
    response.status(400).send("Invalid game ID.");
    return;
  }

  try {
    const membership = await db.oneOrNone<Record<string, number>>(
      "SELECT 1 FROM game_players WHERE game_id = $1 AND user_id = $2",
      [gameId, userId],
    );

    if (!membership) {
      response.status(403).send("You are not in this game.");
      return;
    }

    const user = await db.oneOrNone<LobbyUserRow>(
      "SELECT id, username, email, created_at FROM users WHERE id = $1",
      [userId],
    );

    response.render("game", { title: "Game", user, gameId });
  } catch {
    response.status(500).send("Failed to load game.");
  }
});

export default router;
