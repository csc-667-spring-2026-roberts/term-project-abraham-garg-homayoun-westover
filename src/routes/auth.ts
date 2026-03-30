import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import db from "../db/connection.js";
import requireAuth from "../middleware/requireAuth.js";

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

interface LobbyUserRow {
  id: number;
  email: string;
}

const router = Router();
const SALT_ROUNDS = 10;

function md5(value: string): string {
  return crypto.createHash("md5").update(value.trim().toLowerCase()).digest("hex");
}

// ── GET /auth/register ──────────────────────────────────────────────────────
router.get("/register", (request: Request, response: Response): void => {
  if (request.session.userId) {
    response.redirect("/lobby");
    return;
  }
  response.render("register", { title: "Register", user: null });
});

// ── POST /auth/register ─────────────────────────────────────────────────────
router.post("/register", async (request: Request, response: Response): Promise<void> => {
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
    response.render("register", {
      title: "Register",
      user: null,
      error: "A valid email and a password of at least 6 characters are required.",
      formData: { email: typeof email === "string" ? email : "" },
    });
    return;
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();
    const username = normalizedEmail.split("@")[0];

    const existingUser = await db.oneOrNone<ExistingUserRow>(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail],
    );

    if (existingUser) {
      response.render("register", {
        title: "Register",
        user: null,
        error: "An account with that email already exists.",
        formData: { email: normalizedEmail },
      });
      return;
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await db.one<CreatedUserRow>(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email`,
      [username, normalizedEmail, hash],
    );

    request.session.userId = user.id;
    response.redirect("/lobby");
  } catch {
    response.render("register", {
      title: "Register",
      user: null,
      error: "Something went wrong on our end. Please try again.",
    });
  }
});

// ── GET /auth/login ──────────────────────────────────────────────────────────
router.get("/login", (request: Request, response: Response): void => {
  if (request.session.userId) {
    response.redirect("/lobby");
    return;
  }
  response.render("login", { title: "Sign In", user: null });
});

// ── POST /auth/login ─────────────────────────────────────────────────────────
router.post("/login", async (request: Request, response: Response): Promise<void> => {
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
    response.render("login", {
      title: "Sign In",
      user: null,
      error: "Please enter your email and password.",
      formData: { email: typeof email === "string" ? email : "" },
    });
    return;
  }

  try {
    const user = await db.oneOrNone<LoginUserRow>(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email.toLowerCase().trim()],
    );

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      response.render("login", {
        title: "Sign In",
        user: null,
        error: "Invalid email or password.",
        formData: { email: email.toLowerCase().trim() },
      });
      return;
    }

    request.session.userId = user.id;
    response.redirect("/lobby");
  } catch {
    response.render("login", {
      title: "Sign In",
      user: null,
      error: "Something went wrong on our end. Please try again.",
    });
  }
});

// ── POST /auth/logout ────────────────────────────────────────────────────────
router.post("/logout", (request: Request, response: Response): void => {
  request.session.destroy((error) => {
    if (error) {
      response.redirect("/lobby");
      return;
    }
    response.clearCookie("connect.sid");
    response.redirect("/auth/login");
  });
});

// ── GET /lobby ───────────────────────────────────────────────────────────────
router.get("/lobby", requireAuth, async (request: Request, response: Response): Promise<void> => {
  try {
    const user = await db.oneOrNone<LobbyUserRow>("SELECT id, email FROM users WHERE id = $1", [
      request.session.userId,
    ]);

    if (!user) {
      request.session.destroy(() => {
        /* ignore */
      });
      response.redirect("/auth/login");
      return;
    }

    response.render("lobby", {
      title: "Lobby",
      user,
      gravatarHash: md5(user.email),
    });
  } catch {
    response.redirect("/auth/login");
  }
});

export default router;
