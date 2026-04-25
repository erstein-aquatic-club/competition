# Records club filtrés par appartenance historique — Plan d'implémentation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Filtrer le palmarès club EAC pour ne conserver que les performances réalisées sous licence EAC, en captant la cellule "club au moment de la performance" exposée par FFN.

**Architecture:** Ajout d'une colonne `club_name TEXT` à `swimmer_performances`, lecture du club depuis l'HTML FFN dans le parser partagé, filtrage par égalité stricte sur `app_settings.home_club_name` au recalcul. Backfill via re-import unique post-migration (l'`onConflict` UPDATE remplit les rows existantes). Aucun changement frontend.

**Tech Stack:** Supabase Postgres + Edge Functions (Deno), TypeScript, Node `node:test` pour les tests unitaires (pas Vitest dans ce projet — voir `package.json` `"test"`), MCP Supabase pour appliquer la migration.

**Design doc:** `docs/plans/2026-04-25-records-club-historique-design.md`

**Branche:** travailler directement sur `main` (convention projet, voir derniers commits `git log --oneline -10`).

---

## Pré-requis avant d'attaquer

- Lire le design doc (lien ci-dessus).
- Lire les sections "Workflow de documentation obligatoire", "Migrations Supabase" et "Déploiement" de `CLAUDE.md` à la racine (règles non négociables : MCP pour migrations, pas de `gh-pages` local, §169 à logger).
- Vérifier la dernière migration en place : `ls supabase/migrations/ | tail -1` → la nouvelle migration sera la suivante (probablement `00144_*`).

---

## Task 1 — Capturer une fixture HTML FFN pour les tests

**Files:**
- Create: `src/__tests__/fixtures/ffn-prf-sample.html`

**Step 1: Récupérer le HTML brut**

Run:
```bash
curl -s -A "suivi-natation/1.0" \
  "https://ffn.extranat.fr/webffn/nat_recherche.php?idrch_id=879576&idopt=prf&idbas=25" \
  -o /tmp/ffn-prf-25.html
```

Expected: fichier ~6200 lignes, exit 0.

**Step 2: Extraire un fragment représentatif**

On veut un `<tr>` avec club rempli + le contexte `<thead>` qui annonce le pool size. Ouvrir `/tmp/ffn-prf-25.html`, chercher la première ligne `<thead class="md:text-2xl uppercase bg-blue-600 text-white font-bold">` (autour de la ligne 460), puis copier de là jusqu'à la fin du 3e `<tr>` (3 perfs minimum, dont une avec date/club valides).

Coller dans `src/__tests__/fixtures/ffn-prf-sample.html`. Garder l'en-tête `<thead>` qui contient `Bassin : 25 mètres` (le parser s'appuie sur le mot "Bassin" pour split, voir `parseHtmlFull` dans `supabase/functions/_shared/ffn-parser.ts:42`).

**Step 3: Sanity check**

Run:
```bash
grep -c "ERSTEIN AQUATIC CLUB" src/__tests__/fixtures/ffn-prf-sample.html
```

Expected: ≥ 3.

**Step 4: Commit**

```bash
git add src/__tests__/fixtures/ffn-prf-sample.html
git commit -m "test(ffn): §169 — fixture HTML page performances FFN"
```

---

## Task 2 — Test unitaire qui échoue : extraction du club

**Files:**
- Create: `src/__tests__/ffnParser.test.ts`

**Step 1: Écrire le test rouge**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { parseHtmlFull } from "../../supabase/functions/_shared/ffn-parser";

const fixture = fs.readFileSync(
  path.resolve("src/__tests__/fixtures/ffn-prf-sample.html"),
  "utf8",
);

test("parseHtmlFull captures club_name from FFN performance row", () => {
  const rows = parseHtmlFull(fixture, 25);
  assert.ok(rows.length > 0, "expected at least one parsed row");
  const withClub = rows.filter((r) => r.club_name);
  assert.ok(
    withClub.length >= 1,
    `expected at least one row with club_name, got ${withClub.length}`,
  );
  for (const r of withClub) {
    assert.equal(r.club_name, "ERSTEIN AQUATIC CLUB");
  }
});

test("parseHtmlFull preserves competition_name and time_seconds (no regression)", () => {
  const rows = parseHtmlFull(fixture, 25);
  for (const r of rows) {
    assert.ok(r.time_seconds > 0, "time should parse");
    assert.notEqual(
      r.competition_name,
      "ERSTEIN AQUATIC CLUB",
      "competition_name must not be the club",
    );
  }
});
```

**Step 2: Run le test pour vérifier qu'il échoue**

Run: `npm test -- --test-name-pattern="parseHtmlFull"`

Expected: 2 tests, FAIL — soit `club_name` absent du type (`TypeError: Cannot read properties of undefined`) soit `withClub.length === 0`.

Si erreur de typage TS : `Property 'club_name' does not exist on type 'RecFull'`. C'est attendu — on l'ajoute en task 3.

**Step 3: Pas de commit ici** — on commit après l'implémentation passante.

---

## Task 3 — Implémenter l'extraction `club_name` dans le parser

**Files:**
- Modify: `supabase/functions/_shared/ffn-parser.ts`

**Step 1: Ajouter `club_name` à l'interface `RecFull`**

Localisation : ligne ~34. Remplacer :
```ts
export interface RecFull extends Rec {
  competition_name: string | null;
  competition_location: string | null;
  swimmer_age: number | null;
}
```
par :
```ts
export interface RecFull extends Rec {
  competition_name: string | null;
  competition_location: string | null;
  swimmer_age: number | null;
  club_name: string | null;
}
```

**Step 2: Extraire le club dans `parseHtmlFull`**

Localisation : dans la boucle `for (const row of rows)` (autour des lignes 50–69). Avant le `results.push(...)`, ajouter une extraction dédiée. La cellule club est typiquement l'**avant-dernière cellule non-vide après strip de tags `<button>`/`<a>`** (cf. observation HTML : 10 cellules, club en index 8, dernière vide).

Stratégie robuste : après extraction des `cells` (ligne ~51), parcourir en sens inverse les cellules brutes (avec HTML), skipper celles qui contiennent `<button` ou `<a `, prendre la première dont le contenu textuel matche un libellé club valide (= chaîne alphanumérique, longueur ≥ 4, n'est ni date, ni `pts`, ni `[XXX]` niveau, ni purement numérique, ne contient pas de `<`).

```ts
// Extract club name: walk cells from the end, skip empty / button / link cells
const cellsRaw = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
let clubName: string | null = null;
for (let i = cellsRaw.length - 1; i >= 0; i--) {
  const raw = cellsRaw[i];
  if (/<button|<a\s/i.test(raw)) continue;
  const text = clean(raw.replace(/<[^>]*>/g, ""));
  if (!text || text.length < 4) continue;
  if (parseDate(text)) continue;
  if (/pts/i.test(text)) continue;
  if (/^\[[A-Z]+\]$/.test(text)) continue; // niveau type [DEP]
  if (/^\d+$/.test(text)) continue;
  if (/^\(\d+\s*ans?\)$/i.test(text)) continue; // âge
  // First valid match from the end = club
  clubName = text;
  break;
}
```

**Step 3: Inclure `club_name` dans le `results.push`**

Modifier le push pour ajouter `club_name: clubName` :
```ts
results.push({
  event_name: cells[0],
  pool_length: pool,
  time_seconds: time,
  record_date: date,
  ffn_points: pts,
  competition_name: competitionName,
  competition_location: null,
  swimmer_age: swimmerAge,
  club_name: clubName,
});
```

**Step 4: Run le test pour vérifier qu'il passe**

Run: `npm test -- --test-name-pattern="parseHtmlFull"`

Expected: 2 tests, PASS.

Si fail sur `competition_name` : vérifier qu'on n'a pas accidentellement modifié l'extraction `competitionName` existante (la regex doit rester telle quelle).

**Step 5: Type check**

Run: `npx tsc --noEmit`

Expected: 0 nouvelle erreur (ignorer les erreurs pré-existantes mentionnées dans CLAUDE.md → memory : `src/components/dashboard/*.stories.tsx`).

**Step 6: Commit**

```bash
git add supabase/functions/_shared/ffn-parser.ts src/__tests__/ffnParser.test.ts
git commit -m "feat(ffn): §169 — capture club_name in performance parser

Adds club_name to RecFull interface and extracts the FFN cell containing
the swimmer's club affiliation at performance time. Extraction walks
cells from the end and skips buttons/links, robust to FFN adding
columns. Test fence on captured HTML fixture.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4 — Propager `club_name` dans l'edge function `ffn-performances`

**Files:**
- Modify: `supabase/functions/ffn-performances/index.ts:108-122`

**Step 1: Ajouter `club_name` au mapping upsert**

Dans le `performances.map(p => ({...}))` (ligne ~108), ajouter `club_name: p.club_name,` (en suivant la convention du `swimmer_age != null ? ... : ...` plus haut). Position : juste avant `source: "ffn",`.

```ts
const rows = performances.map(p => ({
  user_id: effectiveUserId,
  swimmer_iuf,
  event_code: p.event_name,
  pool_length: p.pool_length,
  time_seconds: p.time_seconds,
  time_display: formatTimeDisplay(p.time_seconds),
  competition_name: p.swimmer_age != null
    ? (p.competition_name ? `(${p.swimmer_age} ans) ${p.competition_name}` : `(${p.swimmer_age} ans)`)
    : p.competition_name,
  competition_date: p.record_date,
  competition_location: p.competition_location,
  ffn_points: p.ffn_points,
  club_name: p.club_name,           // NEW
  source: "ffn",
}));
```

**Step 2: Pas de test ici** — l'edge function ne tourne pas en local sans `supabase start` lourd. Test d'intégration manuel en task 9.

**Step 3: Pas de commit isolé** — on group avec task 5.

---

## Task 5 — Propager `club_name` dans l'edge function `import-club-records` (côté import)

**Files:**
- Modify: `supabase/functions/import-club-records/index.ts:485-499`

**Step 1: Ajouter `club_name` au mapping upsert (côté boucle bulk)**

Même ajout que task 4, dans la boucle `for (const swimmer of swimmers)` (ligne ~462), section `const rows = perfs.map((p) => ({...}))` (ligne ~485). Position : juste avant `source: "ffn",`.

```ts
const rows = perfs.map((p) => ({
  // ... champs existants ...
  ffn_points: p.ffn_points,
  club_name: p.club_name,           // NEW
  source: "ffn",
}));
```

**Step 2: Commit (les 2 edge functions ensemble)**

```bash
git add supabase/functions/ffn-performances/index.ts supabase/functions/import-club-records/index.ts
git commit -m "feat(ffn): §169 — persist club_name on swimmer_performances upserts

Both edge functions now write the club affiliation captured by the
parser into the new column. onConflict UPDATE means a re-import will
backfill existing rows.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6 — Filtrer le recalcul `club_records` sur le club maison

**Files:**
- Modify: `supabase/functions/import-club-records/index.ts` (interface `RecalcStats` + fonction `recalculateClubRecords`)

**Step 1: Étendre `RecalcStats`**

Ligne ~151. Ajouter `skipped_other_club: number;` :

```ts
interface RecalcStats {
  active_swimmers: number;
  swimmers_with_sex: number;
  total_performances: number;
  skipped_no_swimmer: number;
  skipped_no_event_code: number;
  skipped_no_age: number;
  skipped_other_club: number;        // NEW
  processed: number;
  per_swimmer_bests: number;
  club_records_upserted: number;
  unmapped_event_codes: string[];
}
```

**Step 2: Initialiser le compteur**

Ligne ~165 dans le `stats` initial : ajouter `skipped_other_club: 0,`.

**Step 3: Lire `home_club_name` depuis `app_settings`**

Insérer en début de `recalculateClubRecords` (juste après la déclaration de `stats`, avant le chargement des swimmers ligne ~180) :

```ts
// Read configured home club name (used to filter performances by affiliation)
const { data: homeClubSetting } = await supabaseAdmin
  .from("app_settings")
  .select("value")
  .eq("key", "home_club_name")
  .single();
const homeClubName = (homeClubSetting?.value as string | undefined)
  ?? "ERSTEIN AQUATIC CLUB";
```

**Step 4: Ajouter le filtre dans la boucle de calcul**

Localisation : dans `for (const perf of allPerfs)` (ligne ~226). Insérer **immédiatement après** le `if (!swimmerInfo) { stats.skipped_no_swimmer++; continue; }` :

```ts
if (perf.club_name !== homeClubName) {
  stats.skipped_other_club++;
  continue;
}
```

Ordre important : le check club passe AVANT le check event_code et le check age, pour ne pas gonfler ces compteurs avec des perfs hors-club.

**Step 5: Type check**

Run: `npx tsc --noEmit`

Expected: 0 nouvelle erreur.

**Step 6: Commit**

```bash
git add supabase/functions/import-club-records/index.ts
git commit -m "feat(records): §169 — filter club records by historic affiliation

recalculateClubRecords now reads app_settings.home_club_name and
excludes any swimmer_performance whose club_name differs. Adds
skipped_other_club to RecalcStats for observability — a sudden spike
post-deploy means FFN renamed the club and the setting needs an update.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7 — Migration : colonne `club_name` + setting `home_club_name`

**Files:**
- Create: `supabase/migrations/00144_swimmer_performances_club.sql`

**Step 1: Vérifier le numéro de migration**

Run: `ls supabase/migrations/ | tail -1`

Si le dernier est `00143_*`, utiliser `00144_*`. Sinon ajuster (incrémenter de 1).

**Step 2: Écrire le SQL**

```sql
-- Ajoute le club d'appartenance au moment de la performance (capté depuis FFN).
-- Permet de filtrer le palmarès club aux seules perfs nagées sous le maillot
-- "maison" configuré dans app_settings.home_club_name.

ALTER TABLE swimmer_performances ADD COLUMN IF NOT EXISTS club_name TEXT;

CREATE INDEX IF NOT EXISTS idx_perf_club_name
  ON swimmer_performances(club_name)
  WHERE club_name IS NOT NULL;

-- Libellé exact du club tel que retourné par la cellule club de la table
-- "Performances" FFN. Si la FFN renomme le club, mettre à jour cette valeur
-- (UPDATE app_settings SET value = '"NOUVEAU LIBELLE"'::jsonb WHERE key = 'home_club_name').
INSERT INTO app_settings (key, value) VALUES (
  'home_club_name',
  '"ERSTEIN AQUATIC CLUB"'::jsonb
) ON CONFLICT (key) DO NOTHING;
```

Note : `app_settings` (créé en `00013`) n'a pas de colonne `description` — ne pas en mettre.

**Step 3: Appliquer la migration via MCP**

**Important** : voir CLAUDE.md § "Migrations Supabase" — TOUJOURS via `mcp__plugin_supabase_supabase__apply_migration`, jamais via `supabase db push` ou le dashboard.

```
mcp__plugin_supabase_supabase__apply_migration({
  project_id: "fscnobivsgornxdwqwlk",
  name: "swimmer_performances_club",
  query: <contenu du fichier SQL>
})
```

**Step 4: Vérifier l'application**

Via MCP `execute_sql` :
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'swimmer_performances' AND column_name = 'club_name';
```
Expected: 1 ligne.

```sql
SELECT key, value FROM app_settings WHERE key = 'home_club_name';
```
Expected: `"ERSTEIN AQUATIC CLUB"`.

**Step 5: Commit le fichier SQL**

```bash
git add supabase/migrations/00144_swimmer_performances_club.sql
git commit -m "migration: §169 — add club_name column + home_club_name setting

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8 — Déployer les edge functions

**Files:** aucun changement local — déploiement.

**Step 1: Déployer `ffn-performances` et `import-club-records`**

Via Supabase CLI (l'utilisateur doit avoir `supabase login` actif). Si CLI absent ou utilisateur préfère le dashboard, demander confirmation.

```bash
supabase functions deploy ffn-performances --project-ref fscnobivsgornxdwqwlk
supabase functions deploy import-club-records --project-ref fscnobivsgornxdwqwlk
```

Expected: 2 deploys success, version bump.

**Step 2: Vérifier la version active**

Via MCP `mcp__plugin_supabase_supabase__list_edge_functions` (ou dashboard). Vérifier que les versions ont incrémenté par rapport au tableau dans `CLAUDE.md` (`ffn-performances` v62 → v63, `import-club-records` v73 → v74).

**Step 3: Pas de commit** — déploiement sans changement repo.

---

## Task 9 — Backfill : re-import unique

**Files:** aucun.

**Step 1: Lancer le re-import full mode**

Via l'UI admin (`/RecordsAdmin` route, voir `src/pages/RecordsAdmin.tsx:329`) — l'utilisateur clique "Importer records club". Sinon en CLI :

```bash
curl -X POST "https://fscnobivsgornxdwqwlk.supabase.co/functions/v1/import-club-records" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"mode":"full"}'
```

(Demander à l'utilisateur la `SERVICE_ROLE_KEY` si pas en env, OU lancer depuis l'UI — option safe).

**Durée** : ~45–90s (1.5s × ~30 nageurs + parsing).

**Step 2: Vérifier le succès**

Inspecter la réponse JSON :
- `summary.errors` doit être 0 (ou très faible et explicable).
- `recalc_stats.skipped_other_club` > 0 si certains nageurs ont effectivement nagé hors-EAC. Si toujours 0, soit pas de cas, soit le filtre ne fonctionne pas (vérifier le `club_name` côté DB).

Run via MCP `execute_sql` :
```sql
SELECT
  COUNT(*) FILTER (WHERE club_name IS NOT NULL) AS with_club,
  COUNT(*) FILTER (WHERE club_name = 'ERSTEIN AQUATIC CLUB') AS eac,
  COUNT(*) FILTER (WHERE club_name IS NOT NULL AND club_name <> 'ERSTEIN AQUATIC CLUB') AS other,
  COUNT(*) FILTER (WHERE club_name IS NULL) AS unknown
FROM swimmer_performances;
```

Expected : `with_club` ~ 80–100% des rows. `unknown` faible (perfs très anciennes ou cellule club vide). `other` > 0 si au moins un nageur a effectivement été ailleurs avant.

**Step 3: Spot-check d'un record qui aurait pu changer**

Si l'utilisateur connaît un record qui aurait été potentiellement faussé (nageur arrivé d'un autre club avec un meilleur temps qu'il a nagé hors-EAC), vérifier dans `club_records` que ce record a bien été retiré ou remplacé. Sinon, vérifier qu'un nombre raisonnable de `club_records` sont présents :

```sql
SELECT COUNT(*) FROM club_records;
```
Expected : > 100 (records par sexe × catégorie d'âge × épreuve × bassin).

---

## Task 10 — Documentation §169 et finalisation

**Files:**
- Modify: `docs/implementation-log.md` (ajout §169 en tête)
- Modify: `docs/ROADMAP.md` (ligne §169 + `*Dernière mise à jour*`)
- Modify: `docs/FEATURES_STATUS.md` (records club ⚠️ → ✅)
- Modify: `CLAUDE.md` (bump "Dernière entrée en date : §169" + version edge functions dans la table)

**Step 1: Entrée `implementation-log.md`**

Ajouter en tête (sous le titre, au-dessus de la dernière entrée) une section :

```markdown
## §169 — Records club filtrés par appartenance historique au club (2026-04-25)

**Contexte** : les records EAC agrégeaient toutes les perfs FFN des nageurs actifs sans tenir compte du club nagé au moment de la performance, ce qui faussait le palmarès pour les nageurs venus d'autres clubs.

**Changements** :
- `swimmer_performances` : nouvelle colonne `club_name TEXT` + index partiel.
- `app_settings.home_club_name` (= `"ERSTEIN AQUATIC CLUB"`) configurable.
- Parser FFN (`_shared/ffn-parser.ts`) : capture du libellé club via la dernière cellule textuelle non-vide non-bouton de chaque ligne.
- Edge functions `ffn-performances` et `import-club-records` : persistent `club_name` sur upsert.
- `recalculateClubRecords` : filtre `WHERE club_name = home_club_name`. Nouveau compteur `skipped_other_club` exposé dans la response.
- Re-import full post-migration pour peupler `club_name` sur les rows existantes (l'`onConflict` UPDATE).

**Fichiers modifiés** :
- `supabase/migrations/00144_swimmer_performances_club.sql` (nouveau)
- `supabase/functions/_shared/ffn-parser.ts` (~+20 lignes)
- `supabase/functions/ffn-performances/index.ts` (1 ligne)
- `supabase/functions/import-club-records/index.ts` (~+15 lignes)
- `src/__tests__/ffnParser.test.ts` (nouveau)
- `src/__tests__/fixtures/ffn-prf-sample.html` (nouveau)

**Tests** : Node test fence sur fixture HTML capturée (extraction club + non-régression `competition_name`/`time_seconds`). Pas de test RLS (aucune policy modifiée).

**Décisions** :
- Pas de `club_code` (FFN ne l'expose pas sur la page parsée — uniquement le nom).
- Égalité stricte sur libellé (pas regex, pas allowlist) — YAGNI, modifiable plus tard via `app_settings`.
- NULL → exclu du recalc (fail-safe).

**Limites** : si FFN renomme le club, les records cassent jusqu'à update de `app_settings.home_club_name`. Surveillance via `recalc_stats.skipped_other_club` (drop anormal post-import = signal).
```

**Step 2: Ligne `ROADMAP.md`**

Trouver la section "Chantiers livrés" (ou équivalent). Ajouter en tête :

```markdown
- §169 — Records club filtrés par appartenance historique au club (2026-04-25) ✅
```

Mettre à jour la ligne `*Dernière mise à jour*` en tête du fichier avec la date du jour.

**Step 3: `FEATURES_STATUS.md`**

Trouver la ligne records club, mettre statut → ✅ (ou laisser tel quel si déjà ✅). Ajouter une note :
> Filtrage par appartenance historique au club via `app_settings.home_club_name` (§169).

**Step 4: `CLAUDE.md`**

- Phrase "Dernière entrée en date : §168" → "Dernière entrée en date : §169 (Records club filtrés par appartenance historique au club, ajout colonne `club_name` + filtrage `home_club_name`).".
- Tableau "Edge Functions Supabase" : bump versions de `ffn-performances` (v62 → v63) et `import-club-records` (v73 → v74) — confirmer les vrais numéros via MCP `list_edge_functions`.

**Step 5: Commit final**

```bash
git add docs/implementation-log.md docs/ROADMAP.md docs/FEATURES_STATUS.md CLAUDE.md
git commit -m "docs: §169 — log records club filtrés par appartenance historique

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Validation finale

Avant de claim "done" :

- [ ] `npm test` global passe (au moins les 2 tests du parser ; ne pas laisser régresser le reste).
- [ ] `npx tsc --noEmit` n'introduit pas de nouvelle erreur.
- [ ] Migration appliquée et vérifiée via MCP.
- [ ] Edge functions déployées avec versions bumpées.
- [ ] Re-import effectué avec `errors: 0`.
- [ ] Spot-check SQL : `swimmer_performances.club_name` peuplé sur ≥ 80% des rows.
- [ ] §169 commit final pushé sur `main`.

**Pas de déploiement frontend** : aucun changement dans `src/` autre que les tests. GitHub Pages workflow se déclenchera automatiquement sur push mais n'aura rien de visible à servir — c'est OK.

## Anti-patterns à éviter

- **Ne pas** essayer de déployer via `npx gh-pages -d dist` (CLAUDE.md règle dure).
- **Ne pas** appliquer la migration via `supabase db push` ni via le dashboard — uniquement MCP.
- **Ne pas** lancer `npm run test:rls` : aucune RLS touchée. Voir CLAUDE.md § "Économie de tokens".
- **Ne pas** hard-coder `ERSTEIN AQUATIC CLUB` dans le code edge function : toujours lire depuis `app_settings` (avec fallback uniquement pour le cas où le SELECT échoue).
- **Ne pas** modifier la contrainte UNIQUE de `swimmer_performances` : `club_name` n'en fait pas partie, c'est volontaire (si un nageur change de club mais nage le même temps le même jour à la même compétition, on garde une seule row — physiquement impossible de toute façon).
