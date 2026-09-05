import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { SqliteAdapter } from "./db/SqliteAdapter.js";
import { createApiRouter } from "./api/routes.js";
import { AccountPoolService } from "./core/AccountPoolService.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const app = new Hono();

const dbPath = process.env.DB_PATH || path.join(rootDir, "deezer_accounts.db");
const db = new SqliteAdapter(dbPath);
await db.init();

app.use("*", logger());
app.use("*", cors());

const apiRouter = createApiRouter(db);
app.route("/api", apiRouter);

app.use("/*", serveStatic({ root: "./public" }));

app.get("/", serveStatic({ path: "./public/index.html" }));
app.get("/admin", serveStatic({ path: "./public/index.html" }));

const intervalMinutes = parseInt(process.env.CHECK_INTERVAL_MINUTES || "60", 10);
if (intervalMinutes > 0) {
  const pool = new AccountPoolService(db);
  setInterval(async () => {
    try {
      console.log(`[Scheduler] Running background health check on Deezer accounts...`);
      const res = await pool.checkAllAccounts();
      console.log(`[Scheduler] Complete: ${res.checked} checked, ${res.refreshed} refreshed, ${res.failed} failed.`);
    } catch (err: any) {
      console.error(`[Scheduler] Health check error:`, err?.message || err);
    }
  }, intervalMinutes * 60 * 1000);
}

const port = parseInt(process.env.PORT || process.env.SERVER_PORT || "8787", 10);

console.log(`====================================================`);
console.log(`🎵 Deezer ARL Manager Server running at:`);
console.log(`👉 Web Dashboard: http://localhost:${port}`);
console.log(`👉 REST API:      http://localhost:${port}/api/arl`);
console.log(`👉 Database:      ${dbPath} (SQLite)`);
console.log(`====================================================`);

serve({
  fetch: app.fetch,
  port,
});
