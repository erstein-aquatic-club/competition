import assert from "node:assert/strict";
import { describe, it, beforeEach, before, after } from "node:test";

class StorageStub {
  store = new Map<string, string>();
  broken = false;
  getItem(k: string) {
    if (this.broken) throw new Error("SecurityError");
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.broken) throw new Error("QuotaExceededError");
    this.store.set(k, v);
  }
  removeItem(k: string) {
    if (this.broken) throw new Error("SecurityError");
    this.store.delete(k);
  }
}

const storage = new StorageStub();
let restore: () => void;
before(() => {
  const g = globalThis as Record<string, unknown>;
  const prev = g.window;
  g.window = { sessionStorage: storage };
  restore = () => { g.window = prev; };
});
after(() => restore());

const {
  savePendingMesocycleParams,
  readPendingMesocycleRaw,
  clearPendingMesocycleParams,
  PENDING_MESOCYCLE_KEY,
} = await import("../pendingMesocycleHandoff");

describe("pendingMesocycleHandoff", () => {
  beforeEach(() => {
    storage.broken = false;
    storage.store.clear();
    clearPendingMesocycleParams();
  });

  it("aller-retour nominal via sessionStorage", () => {
    savePendingMesocycleParams({ stroke: "crawl" });
    assert.equal(storage.store.get(PENDING_MESOCYCLE_KEY), '{"stroke":"crawl"}');
    assert.equal(readPendingMesocycleRaw(), '{"stroke":"crawl"}');
  });

  it("sessionStorage indisponible → repli mémoire (avant : boucle génération ↔ aperçu)", () => {
    storage.broken = true;
    savePendingMesocycleParams({ stroke: "dos" });
    assert.equal(readPendingMesocycleRaw(), '{"stroke":"dos"}');
  });

  it("écriture en échec : un ancien payload en sessionStorage ne l'emporte pas sur le nouveau", () => {
    storage.store.set(PENDING_MESOCYCLE_KEY, '{"stroke":"ancien"}');
    const realSet = storage.setItem;
    storage.setItem = () => { throw new Error("QuotaExceededError"); };
    savePendingMesocycleParams({ stroke: "nouveau" });
    storage.setItem = realSet;
    assert.equal(readPendingMesocycleRaw(), '{"stroke":"nouveau"}');
  });

  it("après rechargement (mémoire vide) → relit sessionStorage", () => {
    storage.store.set(PENDING_MESOCYCLE_KEY, '{"stroke":"pap"}');
    assert.equal(readPendingMesocycleRaw(), '{"stroke":"pap"}');
  });

  it("clear vide la mémoire ET sessionStorage", () => {
    savePendingMesocycleParams({ stroke: "brasse" });
    clearPendingMesocycleParams();
    assert.equal(readPendingMesocycleRaw(), null);
    assert.equal(storage.store.has(PENDING_MESOCYCLE_KEY), false);
  });

  it("rien enregistré → null", () => {
    assert.equal(readPendingMesocycleRaw(), null);
  });
});
