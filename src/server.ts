import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import db from "./db/connection.js";
import homeRoutes from "./routes/home.js";
import loggingMiddleware from "./middleware/logging.js";
import testDataRoutes from "./routes/testData.js";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;


const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(express.json());
app.use(express.urlencoded({extended: true}));


app.use(express.static(path.join(__dirname, "..", "public")));


app.use(loggingMiddleware);

app.use("/", homeRoutes);
app.use("/api", testDataRoutes);

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
