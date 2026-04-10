import { Router } from "express";
import type { Request, Response } from "express";
import { broadcastToRoom } from "../lib/sseBroker.js";

const router = Router();

router.post("/broadcast-test", (request: Request, response: Response): void => {
  const body = request.body as { roomId?: unknown } | undefined;
  const roomId = typeof body?.roomId === "string" ? body.roomId : "global";

  broadcastToRoom(roomId, "state-update", {
    message: "Test event from server",
    at: new Date().toISOString(),
  });

  response.json({ ok: true });
});

export default router;
