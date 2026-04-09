import { Router } from "express";
import type { Request, Response } from "express";
import { broadcastToRoom } from "../lib/sseBroker.js";

const router = Router();

router.post("/broadcast-test", (_request: Request, response: Response) => {
  broadcastToRoom("global", "state-update", {
    message: "Test event from server",
    at: new Date().toISOString(),
  });

  response.json({ ok: true });
});

export default router;
