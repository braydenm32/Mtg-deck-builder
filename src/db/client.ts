import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema> & { $client: Client };

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/** Database location: DATABASE_URL (e.g. "file:./data/mtg.db" or a libsql:// URL), default ./data/mtg.db. */
export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), "data", "mtg.db")}`;
}

/** Open a database and bring its schema up to date. */
export async function openDb(url = databaseUrl()): Promise<Db> {
  if (url.startsWith("file:") && !url.includes(":memory:")) {
    fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
  }
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  if (url.startsWith("file:")) {
    // WAL lets the browser keep reading while a bulk sync writes.
    await client.execute("PRAGMA journal_mode = WAL");
    await client.execute("PRAGMA busy_timeout = 5000");
  }
  const db = drizzle(client, { schema }) as Db;
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

// One shared connection per server process (survives Next.js dev hot reloads).
const globalForDb = globalThis as unknown as { __mtgDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__mtgDb ??= openDb();
  return globalForDb.__mtgDb;
}
