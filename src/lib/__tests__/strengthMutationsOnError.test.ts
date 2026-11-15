// §395 (audit muscu 2ᵉ passe, O2) — garde-fou : toute mutation React Query du
// module muscu doit déclarer un `onError`. Il n'existe pas de gestion d'erreur
// globale (`src/lib/queryClient.ts`) : sans `onError`, un échec réseau ou un
// refus RLS ne s'affiche JAMAIS (dialog qui reste ouvert, rien ne se passe).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dirname, "..", "..");

const ROOTS = [
  "components/strength",
  "components/coach/strength",
  "components/coach/CoachMesocyclePanel.tsx",
  "pages/Strength.tsx",
  "pages/StrengthQuestionnaire.tsx",
  "pages/MesocycleGeneration.tsx",
  "pages/MesocyclePreview.tsx",
  "pages/MesocycleAdjust.tsx",
  "pages/KpiWizard.tsx",
  "pages/coach/StrengthCatalog.tsx",
  "pages/coach/StrengthAssessmentScreen.tsx",
];

function walk(path: string): string[] {
  const abs = join(SRC, path);
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs).flatMap((name) => walk(join(path, name)));
}

function sourceFiles(): string[] {
  return ROOTS.flatMap(walk).filter(
    (f) => /\.tsx?$/.test(f) && !/\.(test|vitest)\.tsx?$/.test(f) && !f.includes("__tests__"),
  );
}

/** Blocs `useMutation({ … })` sans `onError`, sous forme `fichier:ligne`. */
function mutationsWithoutOnError(file: string): string[] {
  const s = readFileSync(file, "utf8");
  const out: string[] = [];
  const re = /useMutation(?:<[^>]*>)?\(\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (depth > 0 && i < s.length) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}") depth--;
      i++;
    }
    const block = s.slice(m.index, i);
    if (!block.includes("onError")) {
      const line = s.slice(0, m.index).split("\n").length;
      out.push(`${relative(SRC, file)}:${line}`);
    }
  }
  return out;
}

test("toutes les mutations muscu déclarent un onError", () => {
  const missing = sourceFiles().flatMap(mutationsWithoutOnError);
  assert.deepEqual(missing, [], `Mutations sans onError :\n${missing.join("\n")}`);
});
