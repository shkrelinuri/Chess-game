import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getPool } from "../server/postgres";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migration = await readFile(path.join(scriptDirectory, "../server/migrations/001_subscription_usage.sql"), "utf8");
const pool = getPool();

try {
  await pool.query(migration);
  console.log("Subscription usage tables are ready.");
} finally {
  await pool.end();
}