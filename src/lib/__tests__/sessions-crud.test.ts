import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Session,
  localStorageSave,
  updateSession,
  localStorageGet,
  deleteSession,
} from "@/lib/api";

const createLocalStorageMock = () => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  } as Storage;
};

const sessionsKey = "suivi_natation_sessions";

const baseSession: Session = {
  id: 123,
  athlete_name: "Alex",
  date: "2024-05-02",
  slot: "Soir",
  effort: 3,
  feeling: 3,
  performance: 3,
  engagement: 4,
  fatigue: 2,
  distance: 2000,
  duration: 90,
  comments: "Initial",
  created_at: "2024-05-02T10:00:00.000Z",
};

test("updateSession updates a stored swim entry", async () => {
  globalThis.localStorage = createLocalStorageMock();
  localStorageSave(sessionsKey, [baseSession]);

  const updated = { ...baseSession, comments: "Mise à jour", distance: 2500 };
  const result = await updateSession(updated);

  const stored = localStorageGet(sessionsKey) as Session[];
  assert.equal(result.status, "updated");
  assert.equal(stored[0].comments, "Mise à jour");
  assert.equal(stored[0].distance, 2500);
});

test("deleteSession removes a stored swim entry", async () => {
  globalThis.localStorage = createLocalStorageMock();
  localStorageSave(sessionsKey, [baseSession]);

  const result = await deleteSession(baseSession.id);
  const stored = localStorageGet(sessionsKey) as Session[];

  assert.equal(result.status, "deleted");
  assert.equal(stored.length, 0);
});
