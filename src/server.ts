import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import db, { pgConnectionOptions } from "./db/connection.js";
import { KEEPALIVE_INTERVAL_MS } from "./lib/timing.js";
import ensureAuthTables from "./db/initAuthTables.js";
import { runMigrations } from "./db/runMigrations.js";
import homeRoutes from "./routes/home.js";
import loggingMiddleware from "./middleware/logging.js";
import testDataRoutes from "./routes/testData.js";
import session from "express-session";
import livereload from "livereload";
import connectLivereload from "connect-livereload";
import connectPgSimple from "connect-pg-simple";
import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/gameRoutes.js";
import sseRoutes from "./routes/sse.js";
import broadcastTestRoutes from "./routes/broadcastTest.js";

const app = express();

app.set("trust proxy", 1);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required but was not found in environment.");
}

const PgSession = connectPgSimple(session);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.NODE_ENV !== "production") {
  const liveReloadServer = livereload.createServer({ exts: ["ejs", "css", "js"] });

  liveReloadServer.watch([
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "views"),
  ]);

  app.use(connectLivereload());
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", sseRoutes);
app.use("/api", broadcastTestRoutes);

app.use(
  session({
    store: new PgSession({
      conObject: pgConnectionOptions,
      tableName: "session",
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

app.use(express.static(path.join(__dirname, "..", "public")));

app.use((request, response, next) => {
  response.locals.currentUserId = request.session.userId;
  next();
});

app.use(loggingMiddleware);

app.use("/", homeRoutes);
app.use("/api", testDataRoutes);
app.use("/api", gameRoutes);
app.use("/auth", authRoutes);

const startServer = async (): Promise<void> => {
  try {
    await runMigrations();
    const result = await db.one<{ now: Date }>("SELECT NOW() AS now;");
    console.log(`Database connected. Server time is ${result.now.toISOString()}.`);
    await ensureAuthTables();

    setInterval(() => {
      void db.result("SELECT 1").catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown database keep-alive error.";
        console.error(`Database keep-alive ping failed: ${message}`);
      });
    }, KEEPALIVE_INTERVAL_MS);

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
