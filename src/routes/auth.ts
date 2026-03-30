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

interface AuthPageModel {
  title: string;
  error?: string;
  email?: string;
}

const router = Router();
const SALT_ROUNDS = 10;

router.get("/register", (request: Request, response: Response) => {
  if (request.session.userId) {
    response.redirect("/lobby");
    return;
  }

  response.render("auth/register", {
    title: "Register",
    error: undefined,
    email: "",
  } satisfies AuthPageModel);
});

router.get("/login", (request: Request, response: Response) => {
  if (request.session.userId) {
    response.redirect("/lobby");
    return;
  }

  response.render("auth/login", {
    title: "Login",
    error: undefined,
    email: "",
  } satisfies AuthPageModel);
});

router.post("/register", async (request: Request, response: Response) => {
  const { email, password } = request.body as {
    email?: unknown;
    password?: unknown;
  };

  const emailValue = typeof email === "string" ? email.trim() : "";

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    emailValue === "" ||
    password.length < 6
  ) {
    response.status(400).render("auth/register", {
      title: "Register",
      error: "Valid email and password required (min 6 chars).",
      email: emailValue,
    } satisfies AuthPageModel);
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
      response.status(409).render("auth/register", {
        title: "Register",
        error: "User already exists.",
        email: normalizedEmail,
      } satisfies AuthPageModel);
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
    response.status(500).render("auth/register", {
      title: "Register",
      error: "Server error. Please try again.",
      email: emailValue,
    } satisfies AuthPageModel);
  }
});

router.post("/login", async (request: Request, response: Response) => {
  const { email, password } = request.body as {
    email?: unknown;
    password?: unknown;
  };
  const emailValue = typeof email === "string" ? email.trim() : "";

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    emailValue === "" ||
    password.trim() === ""
  ) {
    response.status(400).render("auth/login", {
      title: "Login",
      error: "Invalid input",
      email: emailValue,
    } satisfies AuthPageModel);
    return;
  }

  try {
    const user = await db.oneOrNone<LoginUserRow>(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email.toLowerCase().trim()],
    );

    const invalidMsg = "Invalid email or password";

    if (!user) {
      response.status(401).render("auth/login", {
        title: "Login",
        error: invalidMsg,
        email: emailValue,
      } satisfies AuthPageModel);
      return;
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      response.status(401).render("auth/login", {
        title: "Login",
        error: invalidMsg,
        email: emailValue,
      } satisfies AuthPageModel);
      return;
    }

    request.session.userId = user.id;
    response.redirect("/lobby");
  } catch {
    response.status(500).render("auth/login", {
      title: "Login",
      error: "Server error. Please try again.",
      email: emailValue,
    } satisfies AuthPageModel);
  }
});

router.post("/logout", (request: Request, response: Response) => {
  request.session.destroy((_error) => {
    response.clearCookie("connect.sid");
    response.redirect("/auth/login");
  });
});

export default router;
