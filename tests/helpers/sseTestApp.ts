import express from "express";
import type { Express } from "express";
import type { Server } from "node:http";
import sseRoutes from "../../src/routes/sse.js";
import broadcastTestRoutes from "../../src/routes/broadcastTest.js";

/**
 * Minimal Express app with only SSE and broadcast routes (no DB/session).
 * Used for automated SSE tests.
 */
export function createSseTestApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", sseRoutes);
  app.use("/api", broadcastTestRoutes);
  return app;
}

export async function startTestServer(app: Express): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(0, "127.0.0.1", () => {
      resolve(s);
    });
    s.on("error", (err: Error) => {
      reject(err);
    });
  });

  const addr = server.address();
  if (addr === null || typeof addr === "string") {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    throw new Error("Could not bind test server");
  }

  const baseUrl = `http://127.0.0.1:${String(addr.port)}`;

  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      }),
  };
}
