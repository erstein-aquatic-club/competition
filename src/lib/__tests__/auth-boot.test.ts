import assert from "node:assert/strict";
import { describe, it, beforeEach, before, after, mock } from "node:test";

// §379 — boot auth non bloquant : loadUser() publie immédiatement l'état
// (isLoaded: true) depuis les claims JWT + snapshot localStorage du contexte
// autoritaire, et revalide en arrière-plan. Le chemin bloquant (await RPC)
// ne subsiste que pour un rôle à approbation SANS snapshot (1er boot appareil).

class StorageStub {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const SNAPSHOT_KEY = "eac-auth-context";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

// RPC contrôlable par test ; défaut = pending pour prouver le non-blocage.
let rpcImpl: () => Promise<{ data: unknown; error: unknown }> = () =>
  new Promise(() => {});

let currentSession: Record<string, unknown> | null = null;

function makeSession(meta: Record<string, unknown>) {
  return {
    user: {
      id: "uuid-7",
      app_metadata: meta,
      user_metadata: { display_name: "Alice" },
      email: "alice@example.com",
    },
    access_token: "tok",
    refresh_token: "ref",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
}

let restoreGlobals: () => void;
let storage: StorageStub;

before(async () => {
  const g = globalThis as Record<string, unknown>;
  const prevLocalStorage = g.localStorage;
  const prevWindow = g.window;
  storage = new StorageStub();
  g.localStorage = storage;
  g.window = { localStorage: storage, location: { hash: "#/" } };
  restoreGlobals = () => {
    g.localStorage = prevLocalStorage;
    g.window = prevWindow;
  };

  mock.module("../supabase.ts", {
    namedExports: {
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: currentSession }, error: null }),
          refreshSession: async () => ({ data: { session: currentSession }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signOut: async () => {},
          updateUser: async () => ({ error: null }),
        },
        rpc: () => rpcImpl(),
        from: () => {
          throw new Error("legacy path should not run in these tests");
        },
      },
    },
  });
  // withTimeout réel poserait un setTimeout 8 s qui retarde la fin du process.
  mock.module("../api/client.ts", {
    namedExports: { withTimeout: <T>(p: Promise<T>) => p },
  });
});

after(() => restoreGlobals());

const { useAuth, handleAuthEvent } = await import("@/lib/auth");

const RACE_MS = 150;
const raceLoad = async () => {
  const load = useAuth.getState().loadUser();
  const winner = await Promise.race([
    load.then(() => "loaded"),
    new Promise((r) => setTimeout(() => r("timeout"), RACE_MS)),
  ]);
  return { load, winner };
};

const tick = () => new Promise((r) => setTimeout(r, 10));

describe("auth — boot non bloquant (§379)", () => {
  beforeEach(() => {
    storage.clear();
    rpcImpl = () => new Promise(() => {});
    useAuth.setState({
      user: null,
      authUid: null,
      userId: null,
      role: null,
      isApproved: null,
      approvalStatus: "unknown",
      isLoaded: false,
      accessToken: null,
      refreshToken: null,
    });
  });

  it("athlète : loadUser résout sans attendre la vérification serveur", async () => {
    currentSession = makeSession({ app_user_id: 7, app_user_role: "athlete" });
    const { winner } = await raceLoad();
    assert.equal(winner, "loaded");
    const s = useAuth.getState();
    assert.equal(s.isLoaded, true);
    assert.equal(s.user, "Alice");
    assert.equal(s.role, "athlete");
    assert.equal(s.approvalStatus, "not_required");
  });

  it("revalidation en fond : un changement de rôle est appliqué + snapshot écrit", async () => {
    currentSession = makeSession({ app_user_id: 7, app_user_role: "athlete" });
    const rpc = deferred<{ data: unknown; error: unknown }>();
    rpcImpl = () => rpc.promise;
    const { winner } = await raceLoad();
    assert.equal(winner, "loaded");
    rpc.resolve({ data: { role: "coach", is_approved: true }, error: null });
    await tick();
    const s = useAuth.getState();
    assert.equal(s.role, "coach");
    assert.equal(s.approvalStatus, "approved");
    const snap = JSON.parse(storage.getItem(SNAPSHOT_KEY) ?? "null");
    assert.equal(snap?.userId, 7);
    assert.equal(snap?.role, "coach");
  });

  it("coach SANS snapshot : le boot reste bloquant jusqu'à la vérification", async () => {
    currentSession = makeSession({ app_user_id: 7, app_user_role: "coach" });
    const rpc = deferred<{ data: unknown; error: unknown }>();
    rpcImpl = () => rpc.promise;
    const { load, winner } = await raceLoad();
    assert.equal(winner, "timeout");
    assert.equal(useAuth.getState().isLoaded, false);
    rpc.resolve({ data: { role: "coach", is_approved: true }, error: null });
    await load;
    const s = useAuth.getState();
    assert.equal(s.isLoaded, true);
    assert.equal(s.approvalStatus, "approved");
  });

  it("coach AVEC snapshot approuvé : boot immédiat depuis le snapshot", async () => {
    currentSession = makeSession({ app_user_id: 7, app_user_role: "coach" });
    storage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ userId: 7, role: "coach", isApproved: true, approvalStatus: "approved" }),
    );
    const { winner } = await raceLoad();
    assert.equal(winner, "loaded");
    const s = useAuth.getState();
    assert.equal(s.isLoaded, true);
    assert.equal(s.role, "coach");
    assert.equal(s.approvalStatus, "approved");
  });

  it("snapshot d'un AUTRE userId ignoré : coach repasse en bloquant", async () => {
    currentSession = makeSession({ app_user_id: 7, app_user_role: "coach" });
    storage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ userId: 99, role: "coach", isApproved: true, approvalStatus: "approved" }),
    );
    const { load, winner } = await raceLoad();
    assert.equal(winner, "timeout");
    rpcImpl = () => Promise.resolve({ data: { role: "coach", is_approved: true }, error: null });
    // débloque la promesse en cours : résoudre le RPC initial n'est plus possible
    // (pending), on vérifie seulement que l'état n'a pas été publié.
    assert.equal(useAuth.getState().isLoaded, false);
    void load;
  });

  it("la revalidation en fond NON autoritaire (réseau coupé) ne dégrade pas l'état optimiste", async () => {
    currentSession = makeSession({ app_user_id: 7, app_user_role: "coach" });
    storage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ userId: 7, role: "coach", isApproved: true, approvalStatus: "approved" }),
    );
    rpcImpl = () => Promise.reject(new Error("offline"));
    const { winner } = await raceLoad();
    assert.equal(winner, "loaded");
    await tick();
    const s = useAuth.getState();
    assert.equal(s.approvalStatus, "approved");
    assert.equal(s.isApproved, true);
  });

  it("SIGNED_OUT purge le snapshot", async () => {
    storage.setItem(
      SNAPSHOT_KEY,
      JSON.stringify({ userId: 7, role: "coach", isApproved: true, approvalStatus: "approved" }),
    );
    handleAuthEvent("SIGNED_OUT", null);
    assert.equal(storage.getItem(SNAPSHOT_KEY), null);
  });
});
