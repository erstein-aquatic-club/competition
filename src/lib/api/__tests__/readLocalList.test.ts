import assert from "node:assert/strict";
import { describe, it, before, after, beforeEach } from "node:test";

const store = new Map<string, string>();
let restore: () => void;
before(() => {
  const g = globalThis as Record<string, unknown>;
  const prev = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  restore = () => { g.localStorage = prev; };
});
after(() => restore());

const { readLocalList } = await import("../localStorage");

// Audit robustesse muscu (lot 4) — avant, `(localStorageGet(k) || []) as any[]`
// laissait passer un objet corrompu et le `.filter` suivant plantait.
describe("readLocalList", () => {
  beforeEach(() => store.clear());

  it("clé absente → []", () => {
    assert.deepEqual(readLocalList("k"), []);
  });

  it("tableau stocké → renvoyé tel quel", () => {
    store.set("k", JSON.stringify([{ id: 1 }, { id: 2 }]));
    assert.deepEqual(readLocalList<{ id: number }>("k"), [{ id: 1 }, { id: 2 }]);
  });

  it("objet (ancien format / corruption) → [] au lieu d'un crash plus loin", () => {
    store.set("k", JSON.stringify({ id: 1 }));
    assert.deepEqual(readLocalList("k"), []);
  });

  it("JSON invalide → []", () => {
    store.set("k", "{pas du json");
    assert.deepEqual(readLocalList("k"), []);
  });
});
