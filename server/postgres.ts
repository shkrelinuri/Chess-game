import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured.");
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  return pool;
}