import { Router } from "express";
import type { Request, Response } from "express";
import db from "../db/connection.js";
import requireAuth from "../middleware/requireAuth.js";

interface LobbyUserRow {
  id: number;
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
      "SELECT id, email, created_at FROM users WHERE id = $1",
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

export default router;
