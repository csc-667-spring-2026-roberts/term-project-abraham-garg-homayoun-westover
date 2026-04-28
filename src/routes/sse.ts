import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { KEEPALIVE_INTERVAL_MS } from "../lib/timing.js";
import { addClient, removeClient } from "../lib/sseBroker.js";

const router = Router();

router.get("/sse", (request: Request, response: Response): void => {
  const roomId = typeof request.query.roomId === "string" ? request.query.roomId : "global";

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");

  response.flushHeaders();

  const clientId = crypto.randomUUID();

  addClient(roomId, clientId, response);

  response.write(`event: connected\ndata: ${JSON.stringify({ clientId, roomId })}\n\n`);

  const ping = setInterval(() => {
    response.write(`: ping\n\n`);
  }, KEEPALIVE_INTERVAL_MS);

  request.on("close", () => {
    clearInterval(ping);
    removeClient(roomId, clientId);
    response.end();
  });
});

export default router;
