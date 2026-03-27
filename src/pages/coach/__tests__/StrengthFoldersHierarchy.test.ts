import assert from "node:assert/strict";
import { test } from "node:test";
import type { StrengthFolder } from "@/lib/api/types";

// --- Pure hierarchy helpers (mirror the logic from StrengthCatalog.tsx) ---

function getRootFolders(folders: StrengthFolder[]): StrengthFolder[] {
  return folders.filter((f) => !f.parent_id);
}

function getSubFoldersMap(folders: StrengthFolder[]): Map<number, StrengthFolder[]> {
  const map = new Map<number, StrengthFolder[]>();
  for (const f of folders) {
    if (f.parent_id) {
      const arr = map.get(f.parent_id) ?? [];
      arr.push(f);
      map.set(f.parent_id, arr);
    }
  }
  return map;
}

function filterByAthlete(
  folders: StrengthFolder[],
  athleteId: number | null,
): StrengthFolder[] {
  if (athleteId === null) {
    // Global folders: no athlete_id AND no parent_id (root level only)
    return folders.filter((f) => f.athlete_id == null && f.parent_id == null);
  }
  // Athlete tree: root folders for this athlete + their children
  const roots = folders.filter(
    (f) => f.athlete_id === athleteId && f.parent_id == null,
  );
  const rootIds = new Set(roots.map((f) => f.id));
  const children = folders.filter(
    (f) => f.parent_id != null && rootIds.has(f.parent_id),
  );
  return [...roots, ...children];
}

// ===================== Tests =====================

// --- Hierarchy computation ---

test("getRootFolders returns only folders with no parent_id", () => {
  const folders: StrengthFolder[] = [
    { id: 1, name: "François", type: "session", sort_order: 0, parent_id: null, athlete_id: 42 },
    { id: 2, name: "Force Max", type: "session", sort_order: 0, parent_id: 1, athlete_id: null },
    { id: 3, name: "Puissance", type: "session", sort_order: 1, parent_id: 1, athlete_id: null },
  ];

  const roots = getRootFolders(folders);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].id, 1);
});

test("getSubFoldersMap groups children by parent_id", () => {
  const folders: StrengthFolder[] = [
    { id: 1, name: "François", type: "session", sort_order: 0, parent_id: null, athlete_id: 42 },
    { id: 2, name: "Force Max", type: "session", sort_order: 0, parent_id: 1, athlete_id: null },
    { id: 3, name: "Puissance", type: "session", sort_order: 1, parent_id: 1, athlete_id: null },
    { id: 4, name: "Alice", type: "session", sort_order: 0, parent_id: null, athlete_id: 99 },
    { id: 5, name: "Endurance", type: "session", sort_order: 0, parent_id: 4, athlete_id: null },
  ];

  const map = getSubFoldersMap(folders);

  assert.equal(map.size, 2); // parent_id 1 and parent_id 4
  assert.deepEqual(
    map.get(1)?.map((f) => f.id),
    [2, 3],
  );
  assert.deepEqual(
    map.get(4)?.map((f) => f.id),
    [5],
  );
  assert.equal(map.get(99), undefined); // no children
});

test("empty folder list produces empty root and empty map", () => {
  const folders: StrengthFolder[] = [];

  assert.equal(getRootFolders(folders).length, 0);
  assert.equal(getSubFoldersMap(folders).size, 0);
});

test("all root folders (no children) produce empty sub-folder map", () => {
  const folders: StrengthFolder[] = [
    { id: 1, name: "A", type: "session", sort_order: 0, parent_id: null, athlete_id: null },
    { id: 2, name: "B", type: "session", sort_order: 1, parent_id: null, athlete_id: null },
  ];

  assert.equal(getRootFolders(folders).length, 2);
  assert.equal(getSubFoldersMap(folders).size, 0);
});

// --- Athlete filtering ---

test("filterByAthlete(null) returns only global root folders", () => {
  const folders: StrengthFolder[] = [
    { id: 1, name: "Global", type: "session", sort_order: 0, parent_id: null, athlete_id: null },
    { id: 2, name: "François", type: "session", sort_order: 0, parent_id: null, athlete_id: 42 },
    { id: 3, name: "Cycle", type: "session", sort_order: 0, parent_id: 2, athlete_id: null },
  ];

  const result = filterByAthlete(folders, null);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 1);
});

test("filterByAthlete(athleteId) returns athlete root + children", () => {
  const folders: StrengthFolder[] = [
    { id: 1, name: "Global", type: "session", sort_order: 0, parent_id: null, athlete_id: null },
    { id: 2, name: "François", type: "session", sort_order: 0, parent_id: null, athlete_id: 42 },
    { id: 3, name: "Force Max", type: "session", sort_order: 0, parent_id: 2, athlete_id: null },
    { id: 4, name: "Puissance", type: "session", sort_order: 1, parent_id: 2, athlete_id: null },
    { id: 5, name: "Alice", type: "session", sort_order: 0, parent_id: null, athlete_id: 99 },
    { id: 6, name: "Endurance", type: "session", sort_order: 0, parent_id: 5, athlete_id: null },
  ];

  const result = filterByAthlete(folders, 42);
  assert.deepEqual(
    result.map((f) => f.id),
    [2, 3, 4],
  );
});

test("filterByAthlete returns empty array for unknown athlete", () => {
  const folders: StrengthFolder[] = [
    { id: 1, name: "Global", type: "session", sort_order: 0, parent_id: null, athlete_id: null },
    { id: 2, name: "François", type: "session", sort_order: 0, parent_id: null, athlete_id: 42 },
  ];

  const result = filterByAthlete(folders, 999);
  assert.equal(result.length, 0);
});

// --- Copy target logic (mirrors CopyToAthleteDialog mutation) ---

test("copy target picks first sub-folder of athlete root when available", () => {
  const targetFolders: StrengthFolder[] = [
    { id: 10, name: "Bob", type: "session", sort_order: 0, parent_id: null, athlete_id: 7 },
    { id: 11, name: "Cycle 1", type: "session", sort_order: 0, parent_id: 10, athlete_id: null },
    { id: 12, name: "Cycle 2", type: "session", sort_order: 1, parent_id: 10, athlete_id: null },
  ];

  const targetAthleteId = 7;
  const rootFolder = targetFolders.find(
    (f) => f.athlete_id === targetAthleteId && !f.parent_id,
  );
  assert.ok(rootFolder);

  const subs = targetFolders.filter((f) => f.parent_id === rootFolder!.id);
  const targetFolderId = subs[0]?.id ?? rootFolder!.id;

  assert.equal(targetFolderId, 11); // first sub-folder
});

test("copy target falls back to root folder when no sub-folders", () => {
  const targetFolders: StrengthFolder[] = [
    { id: 10, name: "Bob", type: "session", sort_order: 0, parent_id: null, athlete_id: 7 },
  ];

  const rootFolder = targetFolders.find(
    (f) => f.athlete_id === 7 && !f.parent_id,
  );
  assert.ok(rootFolder);

  const subs = targetFolders.filter((f) => f.parent_id === rootFolder!.id);
  const targetFolderId = subs[0]?.id ?? rootFolder!.id;

  assert.equal(targetFolderId, 10); // root itself
});

test("copy target returns null when athlete has no folders", () => {
  const targetFolders: StrengthFolder[] = [];

  const rootFolder = targetFolders.find(
    (f) => f.athlete_id === 7 && !f.parent_id,
  );

  let targetFolderId: number | null = null;
  if (rootFolder) {
    const subs = targetFolders.filter((f) => f.parent_id === rootFolder.id);
    targetFolderId = subs[0]?.id ?? rootFolder.id;
  }

  assert.equal(targetFolderId, null);
});
