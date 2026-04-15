/**
 * supabase/tests/rls/_helpers.ts
 *
 * Test harness for RLS integration tests.
 *
 * - Spins up a single shared `pg.Pool` against the local Supabase Postgres
 * - `resetDb()` re-applies schema.sql + seed.sql (idempotent, safe between suites)
 * - `asUser()` runs a callback inside a transaction with `SET LOCAL` JWT claims,
 *   simulating an authenticated PostgREST request. Always rolls back so the
 *   shared seed state is preserved between tests within the same suite.
 *
 * See docs/rls-testing.md for the full pattern.
 */

import { Pool, type PoolClient } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCHEMA_PATH = resolve(__dirname, "../schema.sql");
const SEED_PATH = resolve(__dirname, "../seed.sql");

const DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const pool = new Pool({ connectionString: DB_URL, max: 4 });

/** Reset schema + reseed. Call once per suite via `beforeAll`. */
export async function resetDb(): Promise<void> {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const seed = readFileSync(SEED_PATH, "utf8");
  const client = await pool.connect();
  try {
    await client.query(schema);
    await client.query(seed);
  } finally {
    client.release();
  }
}

/** JWT claim shape mirroring what GoTrue would emit for an authenticated user. */
export interface AuthClaims {
  appUserId: number;
  appUserRole: "athlete" | "coach" | "admin";
}

/**
 * Run `fn` inside a transaction with the given JWT claims set via `SET LOCAL`.
 * The transaction is ALWAYS rolled back afterward — tests should not commit
 * data, they should only assert on what RLS allowed/blocked. This keeps the
 * seed state stable for subsequent tests in the suite.
 *
 * If your test needs to verify that a row WAS persisted, use `asServiceRole`
 * (no transaction wrapper) for the verification step.
 */
export async function asUser<T>(
  claims: AuthClaims,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    const claimsJson = JSON.stringify({
      app_metadata: {
        app_user_id: claims.appUserId,
        app_user_role: claims.appUserRole,
      },
    });
    // pg cannot parameterize SET, so we inline. claimsJson is built from
    // typed AuthClaims, no injection risk.
    await client.query(
      `SET LOCAL "request.jwt.claims" TO '${claimsJson.replace(/'/g, "''")}'`,
    );
    return await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}

/** Run as the postgres superuser, bypassing RLS. Use sparingly — only for
 *  setup/teardown verification, never for the assertion under test. */
export async function asServiceRole<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
