import { Router } from "express";
import type { Request, Response } from "express";

import db from "../db/connection.js";
import requireAuth from "../middleware/requireAuth.js";

interface TestDataRow {
  id: number;
  message: string;
  created_at: Date;
}

interface CreateTestDataBody {
  message?: unknown;
}

const router = Router();

router.get("/test-data", async (_request: Request, response: Response): Promise<void> => {
  try {
    const rows = await db.any<TestDataRow>(
      "SELECT id, message, created_at FROM test_data ORDER BY id DESC;",
    );
    response.status(200).json({ data: rows });
  } catch (error: unknown) {
    if (error instanceof Error) {
      response.status(500).json({ error: error.message });
      return;
    }

    response.status(500).json({ error: "Unknown error while fetching test data." });
  }
});

router.post("/test-data", async (request: Request, response: Response): Promise<void> => {
  const { message } = request.body as CreateTestDataBody;

  if (typeof message !== "string" || message.trim().length === 0) {
    response.status(400).json({ error: "message is required and must be a non-empty string." });
    return;
  }

  try {
    const savedRow = await db.one<TestDataRow>(
      `INSERT INTO test_data (message)
             VALUES ($1)
             RETURNING id, message, created_at;`,
      [message.trim()],
    );

    response.status(201).json({ data: savedRow });
  } catch (error: unknown) {
    if (error instanceof Error) {
      response.status(500).json({ error: error.message });
      return;
    }

    response.status(500).json({ error: "Unknown error while creating test data." });
  }
});

router.get("/protected", requireAuth, (_request: Request, response: Response): void => {
  response.status(200).json({
    message: "You are authorized to access this route!",
  });
});

export default router;
