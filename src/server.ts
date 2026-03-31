import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import db from "./db/connection.js";
import ensureAuthTables from "./db/initAuthTables.js";
import homeRoutes from "./routes/home.js";
import loggingMiddleware from "./middleware/logging.js";
import testDataRoutes from "./routes/testData.js";
import session from "express-session";
import livereload from "livereload";
import connectLivereload from "connect-livereload";
import connectPgSimple from "connect-pg-simple";
import authRoutes from "./routes/auth.js";
import gameRoutes from "./routes/gameRoutes.js";

const app = express();
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

app.use(
  session({
    store: new PgSession({
      conString: process.env.DATABASE_URL,
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
    const result = await db.one<{ now: Date }>("SELECT NOW() AS now;");
    console.log(`Database connected. Server time is ${result.now.toISOString()}.`);
    await ensureAuthTables();

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
