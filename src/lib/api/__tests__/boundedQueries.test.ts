import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { mock } from "node:test";

// §378 — filets de sécurité anti-vieillissement : les requêtes de liste sur les
// tables qui grossissent avec l'usage (catalogues, notifications, chronos,
// imports, pointages) doivent porter une borne serveur (.limit). Sans elle,
// l'app ralentit silencieusement à mesure que la saison avance.
//
// Harnais : supabase.from() renvoie un builder espion chaînable + awaitable
// ({ data: [], error: null }) ; on enregistre les appels par table.

type RecordedCall = { method: string; args: unknown[] };
const callsByTable = new Map<string, RecordedCall[]>();

function makeSpyBuilder(calls: RecordedCall[]) {
  const proxy: any = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: [], error: null, count: 0 });
        }
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          return proxy;
        };
      },
    },
  );
  return proxy;
}

function limitCalledWith(table: string): unknown[] | null {
  const calls = callsByTable.get(table) ?? [];
  const hit = calls.find((c) => c.method === "limit");
  return hit ? hit.args : null;
}

before(async () => {
  const real = await import("../client.ts");
  mock.module("../client.ts", {
    namedExports: {
      ...real,
      canUseSupabase: () => true,
      fetchUserGroupIds: async () => [],
      supabase: {
        from: (table: string) => {
          const calls = callsByTable.get(table) ?? [];
          callsByTable.set(table, calls);
          return makeSpyBuilder(calls);
        },
        auth: { getUser: async () => ({ data: { user: null } }) },
      },
    },
  });
  mock.module("../localStorage", {
    namedExports: {
      localStorageGet: () => null,
      localStorageSave: () => undefined,
    },
  });
});

describe("§378 — bornage serveur des requêtes de liste (tables croissantes)", () => {
  it("getSwimCatalog borne swim_sessions_catalog à 500", async () => {
    const { getSwimCatalog } = await import("../swim.ts");
    await getSwimCatalog();
    assert.deepEqual(limitCalledWith("swim_sessions_catalog"), [500]);
  });

  it("getStrengthSessions borne strength_sessions à 500", async () => {
    const { getStrengthSessions } = await import("../strength.ts");
    await getStrengthSessions();
    assert.deepEqual(limitCalledWith("strength_sessions"), [500]);
  });

  it("notifications_list borne notification_targets à 500 (pagination client conservée)", async () => {
    const { notifications_list } = await import("../notifications.ts");
    await notifications_list({ targetUserId: 1 });
    assert.deepEqual(limitCalledWith("notification_targets"), [500]);
  });

  it("getChronoRecords borne chrono_records à 200", async () => {
    const { getChronoRecords } = await import("../chrono-records.ts");
    await getChronoRecords();
    assert.deepEqual(limitCalledWith("chrono_records"), [200]);
  });

  it("getImportLogs sans filtre applique un défaut de 50", async () => {
    const { getImportLogs } = await import("../records.ts");
    await getImportLogs();
    assert.deepEqual(limitCalledWith("import_logs"), [50]);
  });

  it("listTimesheetShifts porte un garde-fou à 1000", async () => {
    const { listTimesheetShifts } = await import("../timesheet.ts");
    await listTimesheetShifts();
    assert.deepEqual(limitCalledWith("timesheet_shifts"), [1000]);
  });
});
