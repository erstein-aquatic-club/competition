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

// Make sure the pool is released when Vitest exits. Individual test files
// should NOT call `pool.end()` in their afterAll — since the pool is
// module-level and shared across suites (isolate: false), the first suite
// to call end() would break the rest. Process exit is safe.
let cleanupRegistered = false;
export function registerPoolCleanup(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  const cleanup = () => {
    pool.end().catch(() => {});
  };
  process.once("beforeExit", cleanup);
  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);
}
registerPoolCleanup();

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
  /**
   * Optional UUID to populate the `sub` claim, which `auth.uid()` reads.
   * Only needed when the policy under test uses `auth.uid()` directly
   * (e.g. `interviews_coach_select` with `created_by = (SELECT auth.uid())`).
   * Convention: use deterministic UUIDs like `00000000-0000-0000-0000-000000000003`
   * (last segment = user id) for readability in seed data.
   */
  authUid?: string;
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
      sub: claims.authUid ?? "00000000-0000-0000-0000-000000000000",
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

/** Run as the `anon` role with no JWT claims (auth.uid() = NULL).
 *  Use for testing public/unauthenticated access paths. Always rolls back. */
export async function asAnon<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE anon");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
  }
}
