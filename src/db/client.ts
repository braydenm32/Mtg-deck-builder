import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema> & { $client: Client };

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * Database location: DATABASE_URL (e.g. "file:./data/mtg.db" or a libsql:// URL), or the
 * TURSO_DATABASE_URL that Vercel's Turso integration sets; default ./data/mtg.db.
 */
export function databaseUrl(): string {
  const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
  if (url) return url;
  if (process.env.VERCEL) {
    // Vercel has no disk to keep a database file on; without a hosted database nothing can be saved.
    throw new Error(
      "No database connected. In Vercel, open this project's Storage tab, add a Turso database and connect it, then redeploy (see docs/hosting.md).",
    );
  }
  return `file:${path.join(process.cwd(), "data", "mtg.db")}`;
}

/** True when the database is a hosted libSQL server (Turso) rather than a file on this machine. */
export function isRemoteDb(url = databaseUrl()): boolean {
  return !url.startsWith("file:");
}

/** True when this connection goes over the network (each query is a round trip, no long transactions). */
export function isRemote(db: Db): boolean {
  return db.$client.protocol !== "file";
}

function authToken(): string | undefined {
  return process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined;
}

/** Open a database and bring its schema up to date. */
export async function openDb(url = databaseUrl()): Promise<Db> {
  if (url.startsWith("file:") && !url.includes(":memory:")) {
    fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
  }
  const client = createClient({ url, authToken: authToken() });
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
  if (!globalForDb.__mtgDb) {
    const p = openDb();
    // A failed open (database unreachable for a moment) shouldn't stick for the life of the server.
    p.catch(() => {
      if (globalForDb.__mtgDb === p) delete globalForDb.__mtgDb;
    });
    globalForDb.__mtgDb = p;
  }
  return globalForDb.__mtgDb;
}
