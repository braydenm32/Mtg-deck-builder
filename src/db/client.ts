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

/**
 * Dev only: DB_LATENCY_MS=8 adds that delay to every round trip, so a local copy behaves like the
 * hosted database (every query is a network trip to Turso), and DB_TRACE=1 logs each trip as
 * "[db-trip]". `npm run bench:pages` uses both to time pages. Never set on Vercel.
 */
function simulateRemote(client: Client): Client {
  const latency = Number(process.env.DB_LATENCY_MS ?? 0);
  const trace = process.env.DB_TRACE === "1";
  if (!latency && !trace) return client;
  const trip = async (what: string) => {
    if (trace) console.log(`[db-trip] ${what.replace(/\s+/g, " ").trim()}`);
    if (latency) await new Promise((r) => setTimeout(r, latency));
  };
  const sqlOf = (s: unknown) => (typeof s === "string" ? s : String((s as { sql?: string })?.sql ?? ""));
  const wrap = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(t, prop, recv) {
        const v = Reflect.get(t, prop, recv);
        if (typeof v !== "function") return v;
        if (prop === "execute") return async (s: unknown, a?: unknown) => (await trip(sqlOf(s)), v.call(t, s, a));
        if (prop === "batch") return async (s: unknown[], m?: unknown) => (await trip(s.map(sqlOf).join(" ;; ")), v.call(t, s, m));
        if (prop === "executeMultiple" || prop === "migrate") return async (s: unknown) => (await trip(String(prop)), v.call(t, s));
        if (prop === "transaction") return async (m?: unknown) => (await trip("begin"), wrap(await v.call(t, m)));
        if (prop === "commit" || prop === "rollback") return async () => (await trip(String(prop)), v.call(t));
        return v.bind(t);
      },
    });
  return wrap(client);
}

/** Open a database and bring its schema up to date. */
export async function openDb(url = databaseUrl()): Promise<Db> {
  if (url.startsWith("file:") && !url.includes(":memory:")) {
    fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
  }
  const client = simulateRemote(createClient({ url, authToken: authToken() }));
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
