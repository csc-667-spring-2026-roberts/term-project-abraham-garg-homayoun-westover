import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import db from "./db/connection.js";
import homeRoutes from "./routes/home.js";
import loggingMiddleware from "./middleware/logging.js";
import testDataRoutes from "./routes/testData.js";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import authRoutes from "./routes/auth.js";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

const PgSession = connectPgSimple(session);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsDir = path.join(__dirname, "views");
const layoutPath = path.join(viewsDir, "layout.ejs");

// ── View engine ──────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", viewsDir);

// Wrap every res.render() call in the shared layout automatically.
// We read the layout once and inject the rendered body into it so
// individual view files only need to contain their own content.
app.use((_req, res, next): void => {
  const originalRender = res.render.bind(res);

  res.render = function (
    view: string,
    options?: object | ((err: Error, html: string) => void),
    callback?: (err: Error, html: string) => void,
  ): void {
    // Render the inner view first, then wrap it in the layout.
    const innerCb = (err: Error | null, innerHtml: string): void => {
      if (err) {
        next(err);
        return;
      }

      const layoutData = Object.assign({}, typeof options === "object" ? options : {}, {
        body: innerHtml,
      });

      // Read the layout template and render it with the inner HTML injected.
      fs.readFile(layoutPath, "utf8", (readErr, layoutSrc) => {
        if (readErr) {
          next(readErr);
          return;
        }

        import("ejs")
          .then(({ default: ejs }) => {
            const html = ejs.render(layoutSrc, layoutData, {
              filename: layoutPath,
              views: [viewsDir],
            });

            if (callback) {
              callback(null as unknown as Error, html);
            } else {
              res.send(html);
            }
          })
          .catch((importErr: unknown) => {
            next(importErr);
          });
      });
    };

    // Render the view without sending, using the inner callback.
    if (typeof options === "function") {
      originalRender(view, innerCb);
    } else {
      originalRender(view, options ?? {}, innerCb);
    }
  };

  next();
});

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Session ──────────────────────────────────────────────────────────────────
app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: "session",
    }),
    secret: process.env.SESSION_SECRET ?? "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

// ── Static assets ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "..", "public")));

// ── Logging ──────────────────────────────────────────────────────────────────
app.use(loggingMiddleware);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/auth", authRoutes);

// /lobby is handled inside authRoutes (GET /auth/lobby → moved to /lobby)
// Re-export the lobby handler via a top-level path:
app.get("/lobby", (_req, res, next) => {
  // Forward to auth router's lobby handler
  _req.url = "/lobby";
  authRoutes(_req, res, next);
});

app.use("/api", testDataRoutes);
app.use("/", homeRoutes);

// ── Start ─────────────────────────────────────────────────────────────────────
const startServer = async (): Promise<void> => {
  try {
    const result = await db.one<{ now: Date }>("SELECT NOW() AS now;");
    console.log(`Database connected. Server time is ${result.now.toISOString()}.`);

    app.listen(PORT, () => {
      console.log(`Server started on port ${String(PORT)} at ${new Date().toLocaleTimeString()}`);
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Failed to connect to database: ${error.message}`);
    } else {
      console.error("Failed to connect to database with an unknown error.");
    }

    process.exit(1);
  }
};

void startServer();
