import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import db from "../db/connection.js";

interface ExistingUserRow {
  id: number;
}

interface CreatedUserRow {
  id: number;
  email: string;
}

interface LoginUserRow {
  id: number;
  email: string;
  password_hash: string;
}

const router = Router();
const SALT_ROUNDS = 10;

router.post("/register", async (request: Request, response: Response) => {
  const { email, password } = request.body as {
    email?: unknown;
    password?: unknown;
  };

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.trim() === "" ||
    password.length < 6
  ) {
    return response.status(400).json({
      error: "Valid email and password required (min 6 chars).",
    });
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const username = normalizedEmail.split("@")[0];

    const existingUser = await db.oneOrNone<ExistingUserRow>(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail],
    );

    if (existingUser) {
      return response.status(409).json({ error: "User already exists." });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await db.one<CreatedUserRow>(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email`,
      [username, normalizedEmail, hash],
    );

    request.session.userId = user.id;

    return response.status(201).json({
      message: "Registered successfully",
      user,
    });
  } catch {
    return response.status(500).json({ error: "Server error" });
  }
});

router.post("/login", async (request: Request, response: Response) => {
  const { email, password } = request.body as {
    email?: unknown;
    password?: unknown;
  };

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.trim() === "" ||
    password.trim() === ""
  ) {
    return response.status(400).json({ error: "Invalid input" });
  }

  try {
    const user = await db.oneOrNone<LoginUserRow>(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email.toLowerCase().trim()],
    );

    const invalidMsg = "Invalid email or password";

    if (!user) {
      return response.status(401).json({ error: invalidMsg });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return response.status(401).json({ error: invalidMsg });
    }

    request.session.userId = user.id;

    return response.json({ message: "Login successful" });
  } catch {
    return response.status(500).json({ error: "Server error" });
  }
});

router.post("/logout", (request: Request, response: Response) => {
  request.session.destroy((error) => {
    if (error) {
      return response.status(500).json({ error: "Failed to log out" });
    }

    response.clearCookie("connect.sid");
    return response.json({ message: "Logged out" });
  });
});

export default router;
