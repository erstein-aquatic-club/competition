# ChronoSetup Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refondre `ChronoSetup` avec progressive disclosure — section "Avancé" repliée par défaut, preset chips pour Distance/Splits, sticky footer "Lancer", lanes restructurées.

**Architecture:** Tous les changements sont dans `src/components/chrono/ChronoSetup.tsx` (UI pure, aucun changement de reducer/state/API). La section "Avancé" persiste son état ouvert/fermé dans `localStorage("eac-chrono-advanced-open")`. Pas de nouveau fichier.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Lucide icons, localStorage.

**Design doc:** `docs/plans/2026-04-20-chrono-setup-redesign-design.md`

**Conventions (CLAUDE.md) :**
- Nouvelle entrée §155 dans `docs/implementation-log.md`
- Mise à jour `docs/ROADMAP.md` + `docs/FEATURES_STATUS.md` + `CLAUDE.md § Chantiers`
- `npx tsc --noEmit` + `npm test` avant chaque commit
- Pas de `npm run test:rls` (zéro changement RLS)

---

## Progression

| Task | Statut | Commit |
|---|---|---|
| Task 1 — Restructuration des lane cards | ⏳ TODO | — |
| Task 2 — Preset chips Distance + Splits | ⏳ TODO | — |
| Task 3 — Section "Avancé" collapsible | ⏳ TODO | — |
| Task 4 — Sticky footer + suppression header CTA | ⏳ TODO | — |
| Task 5 — Documentation §155 | ⏳ TODO | — |

---

## Task 1 — Restructuration des lane cards

**Fichiers :**
- Modifier : `src/components/chrono/ChronoSetup.tsx`

**Objectif :** Le bouton `[+ Ajouter]` est intégré dans chaque lane card (toujours visible). Une lane vide affiche un texte ghost. Le compteur `[− Lignes N +]` descend sous la liste des lanes.

**Step 1 : Déplacer le compteur de lignes sous les lanes**

Repérer le bloc `{/* ── Lane count controls + wave dots ─────────────── */}` (actuellement avant les lane sections). Le **couper** et le **coller juste après** la `</div>` fermante de `{/* ── Lane sections ──────────────────────────── */}`.

Le nouveau rendu doit ressembler à :

```
[Lane sections]
[Wave dots  |  − Lignes N +]
```

Pour intégrer les wave dots et le compteur dans une même ligne après les lanes, remplacer le bloc déplacé par :

```tsx
{/* ── Ligne count + wave badges ─────────────── */}
<div className="flex items-center gap-3 flex-wrap">
  <Button
    variant="outline"
    size="icon"
    className="h-10 w-10"
    onClick={() => dispatch({ type: "SET_LANE_COUNT", count: state.laneCount - 1 })}
    disabled={state.laneCount <= 1}
  >
    <Minus className="h-4 w-4" />
  </Button>
  <span className="text-sm text-muted-foreground">
    {state.laneCount} ligne{state.laneCount > 1 ? "s" : ""}
  </span>
  <Button
    variant="outline"
    size="icon"
    className="h-10 w-10"
    onClick={() => dispatch({ type: "SET_LANE_COUNT", count: state.laneCount + 1 })}
    disabled={state.laneCount >= maxLanes}
  >
    <Plus className="h-4 w-4" />
  </Button>

  {activeWaves.length > 0 && (
    <div className="ml-auto flex items-center gap-1.5">
      {activeWaves.map((w) => {
        const c = WAVE_COLORS[w - 1];
        return (
          <span
            key={w}
            className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium ${c.bg} ${c.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
            {c.label}
          </span>
        );
      })}
    </div>
  )}
</div>
```

**Step 2 : Restructurer chaque lane card**

Remplacer le rendu des lane sections par :

```tsx
{/* ── Lane sections ──────────────────────────── */}
<div className="flex flex-col gap-3">
  {Array.from({ length: state.laneCount }, (_, i) => i + 1).map((lane) => {
    const swimmers = swimmersByLane(lane);
    const isEmpty = swimmers.length === 0;
    return (
      <div
        key={lane}
        className={`rounded-lg border bg-card p-3 transition-colors ${
          isEmpty ? "border-border/50 bg-card/40" : "border-border"
        }`}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">
            Ligne {lane}
          </span>
          {swimmers.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {swimmers.length} nageur{swimmers.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {swimmers.map((s) => (
            <SwimmerChip
              key={s.key}
              swimmer={s}
              laneCount={state.laneCount}
              maxSwimmersPerLane={maxSwimmersPerLane}
              allSwimmers={state.swimmers}
              maxWaves={maxWaves}
              dispatch={dispatch}
            />
          ))}

          {isEmpty && (
            <p className="flex-1 py-1 text-xs italic text-muted-foreground/50 select-none">
              Vide — appuyez sur + pour ajouter un nageur
            </p>
          )}

          {swimmers.length < maxSwimmersPerLane && (
            <button
              type="button"
              onClick={() => { setAddLane(lane); setSearch(""); }}
              className="ml-auto flex h-9 items-center gap-1.5 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground hover:border-primary/50 hover:bg-muted hover:text-primary transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          )}
        </div>
      </div>
    );
  })}
</div>
```

**Step 3 : Type check**

```bash
npx tsc --noEmit
```
Attendu : aucune erreur.

**Step 4 : Commit**

```bash
git add src/components/chrono/ChronoSetup.tsx
git commit -m "refactor(chrono): restructure lane cards — ajouter intégré + ghost text + compteur sous lanes

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2 — Preset chips Distance + Splits

**Fichiers :**
- Modifier : `src/components/chrono/ChronoSetup.tsx`

**Objectif :** Ajouter des pill chips cliquables sous chaque stepper pour les valeurs courantes. Améliorer les labels descriptifs. Passer à un layout 2 colonnes sur ≥ 480px.

**Step 1 : Remplacer le bloc `{/* ── Série / Distance config ─────────────────── */}`**

```tsx
{/* ── Programme ─────────────────────────────── */}
<div className="rounded-lg border border-border bg-card/50 p-3">
  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
    Programme
  </p>

  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    {/* Distance totale */}
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">Distance totale</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-10 w-10"
          onClick={() => {
            const prev = [...DISTANCE_PRESETS].reverse().find((d) => d < state.totalDistanceM);
            dispatch({ type: "SET_TOTAL_DISTANCE", meters: prev ?? 0 });
          }}
          disabled={state.totalDistanceM <= 0}
        ><Minus className="h-3.5 w-3.5" /></Button>
        <input
          type="text" inputMode="numeric"
          value={state.totalDistanceM || ""} placeholder="—"
          onChange={(e) => dispatch({ type: "SET_TOTAL_DISTANCE", meters: Number(e.target.value.replace(/\D/g, "")) || 0 })}
          className="w-16 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">m</span>
        <Button variant="outline" size="icon" className="h-10 w-10"
          onClick={() => {
            const next = DISTANCE_PRESETS.find((d) => d > state.totalDistanceM);
            dispatch({ type: "SET_TOTAL_DISTANCE", meters: next ?? state.totalDistanceM + 100 });
          }}
        ><Plus className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {DISTANCE_PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => dispatch({ type: "SET_TOTAL_DISTANCE", meters: d })}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
              state.totalDistanceM === d
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {d} m
          </button>
        ))}
      </div>
    </div>

    {/* Splits */}
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">Splits tous les</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-10 w-10"
          onClick={() => {
            const prev = [...SPLIT_PRESETS].reverse().find((d) => d < state.splitDistanceM);
            dispatch({ type: "SET_SPLIT_DISTANCE", meters: prev ?? 25 });
          }}
          disabled={state.splitDistanceM <= 25}
        ><Minus className="h-3.5 w-3.5" /></Button>
        <input
          type="text" inputMode="numeric"
          value={state.splitDistanceM || ""} placeholder="50"
          onChange={(e) => dispatch({ type: "SET_SPLIT_DISTANCE", meters: Number(e.target.value.replace(/\D/g, "")) || 0 })}
          className="w-14 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
        />
        <span className="text-xs text-muted-foreground">m</span>
        <Button variant="outline" size="icon" className="h-10 w-10"
          onClick={() => {
            const next = SPLIT_PRESETS.find((d) => d > state.splitDistanceM);
            dispatch({ type: "SET_SPLIT_DISTANCE", meters: next ?? state.splitDistanceM + 25 });
          }}
        ><Plus className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SPLIT_PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => dispatch({ type: "SET_SPLIT_DISTANCE", meters: d })}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
              state.splitDistanceM === d
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {d} m
          </button>
        ))}
      </div>
    </div>
  </div>
</div>
```

**Step 2 : Vérifier que `DISTANCE_PRESETS` et `SPLIT_PRESETS` sont bien importés**

Grep dans le fichier :
```bash
grep -n "DISTANCE_PRESETS\|SPLIT_PRESETS" src/components/chrono/ChronoSetup.tsx
```
Attendu : déjà présents dans l'import de `chrono-types`. Si absent, les ajouter à la ligne d'import existante.

**Step 3 : Type check**

```bash
npx tsc --noEmit
```
Attendu : aucune erreur.

**Step 4 : Commit**

```bash
git add src/components/chrono/ChronoSetup.tsx
git commit -m "feat(chrono): preset chips distance + splits + layout 2 colonnes Programme

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3 — Section "Avancé" collapsible

**Fichiers :**
- Modifier : `src/components/chrono/ChronoSetup.tsx`

**Objectif :** Envelopper le stepper Séries + les WaveConfigCards dans une section collapsible. État open/closed persisté dans `localStorage`. Badge résumé affiché quand replié.

**Step 1 : Ajouter le state `advancedOpen` avec persistance localStorage**

Dans le corps du composant `ChronoSetup`, après les autres `useState`, ajouter :

```tsx
const [advancedOpen, setAdvancedOpen] = useState<boolean>(() => {
  try {
    return localStorage.getItem("eac-chrono-advanced-open") === "true";
  } catch {
    return false;
  }
});

const toggleAdvanced = useCallback(() => {
  setAdvancedOpen((prev) => {
    const next = !prev;
    try { localStorage.setItem("eac-chrono-advanced-open", String(next)); } catch { /* ignore */ }
    return next;
  });
}, []);
```

**Step 2 : Calculer le badge résumé**

Ajouter après le `toggleAdvanced` :

```tsx
const advancedSummary = useMemo(() => {
  const parts: string[] = [];
  if (state.seriesCount > 0) parts.push(`${state.seriesCount} série${state.seriesCount > 1 ? "s" : ""}`);
  if (activeWaves.length > 1) parts.push(`${activeWaves.length} vagues`);
  const hasInterval = state.waves.some((w) => w.departureIntervalSec > 0);
  if (hasInterval) parts.push("intervalles");
  return parts.length > 0 ? `· ${parts.join(" · ")}` : "";
}, [state.seriesCount, activeWaves.length, state.waves]);
```

**Step 3 : Ajouter l'import `ChevronRight` et `ChevronDown` depuis lucide-react**

Vérifier la ligne d'import Lucide :
```bash
grep -n "from \"lucide-react\"" src/components/chrono/ChronoSetup.tsx
```
Ajouter `ChevronRight, ChevronDown` à l'import existant si absent.

**Step 4 : Remplacer les blocs Séries + WaveConfigCards**

Supprimer le bloc actuel `{/* ── Per-wave config cards … */}` ET le bloc Séries dans Programme, et les remplacer par la section "Avancé" collapsible **à la fin de la card Programme**, juste après les preset chips Splits :

```tsx
    {/* Séparateur + section Avancé */}
    <div className="mt-3 border-t border-border/50 pt-3">
      <button
        type="button"
        onClick={toggleAdvanced}
        className="flex w-full items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {advancedOpen
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        }
        <span>Avancé</span>
        {!advancedOpen && advancedSummary && (
          <span className="text-muted-foreground/60 font-normal">{advancedSummary}</span>
        )}
      </button>

      {advancedOpen && (
        <div className="mt-3 flex flex-col gap-4">
          {/* Séries */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Séries :</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-10 w-10"
                onClick={() => dispatch({ type: "SET_SERIES_COUNT", count: Math.max(0, state.seriesCount - 1) })}
                disabled={state.seriesCount <= 0}
              ><Minus className="h-3.5 w-3.5" /></Button>
              <input type="text" inputMode="numeric" value={state.seriesCount || ""} placeholder="∞"
                onChange={(e) => dispatch({ type: "SET_SERIES_COUNT", count: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                className="w-10 text-center font-mono text-sm font-bold bg-transparent border-b border-border outline-none focus:border-primary"
              />
              <Button variant="outline" size="icon" className="h-10 w-10"
                onClick={() => dispatch({ type: "SET_SERIES_COUNT", count: state.seriesCount + 1 })}
              ><Plus className="h-3.5 w-3.5" /></Button>
            </div>
          </div>

          {/* WaveConfigCards */}
          {activeWaves.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Par vague</span>
                {(() => {
                  const customCount = state.waves.filter((w) => w.overrides !== null).length;
                  if (customCount === 0) return null;
                  return (
                    <span className="text-[10px] text-muted-foreground/70 italic">
                      {customCount} personnalisée{customCount > 1 ? "s" : ""}
                    </span>
                  );
                })()}
              </div>
              <div className="flex flex-col gap-2">
                {activeWaves.map((w) => (
                  <WaveConfigCard key={w} wave={w} state={state} dispatch={dispatch} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
```

**Note :** Ce bloc va **à l'intérieur** de la card `Programme` (dans le `<div className="rounded-lg border...">` de Task 2), après la grid Distance/Splits.

**Step 5 : Supprimer les anciens blocs désormais dupliqués**

S'assurer qu'il ne reste plus :
- Le bloc `{/* ── Per-wave config cards … */}` à l'ancienne position
- La ligne `{/* ── Série / Distance config ─────────── */}` si elle traîne encore en dehors de la card Programme

Vérifier avec :
```bash
grep -n "Per-wave config\|Série / Distance\|activeWaves.map" src/components/chrono/ChronoSetup.tsx
```
Attendu : `activeWaves.map` n'apparaît qu'une seule fois (dans la section Avancé) + une fois pour les wave badges.

**Step 6 : Type check**

```bash
npx tsc --noEmit
```
Attendu : aucune erreur.

**Step 7 : Commit**

```bash
git add src/components/chrono/ChronoSetup.tsx
git commit -m "feat(chrono): section Avancé collapsible + badge résumé + persistance localStorage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4 — Sticky footer + suppression header CTA

**Fichiers :**
- Modifier : `src/components/chrono/ChronoSetup.tsx`

**Objectif :** Ajouter un sticky footer avec résumé de séance + bouton "Lancer". Supprimer le bouton "Lancer" du header. Supprimer le header "Préparation" (le titre remplace ce rôle).

**Step 1 : Supprimer le bloc header**

Supprimer entièrement le bloc :
```tsx
{/* ── Header ─────────────────────────────────────── */}
<div className="flex items-center justify-between">
  <h2 className="text-lg font-semibold">Préparation</h2>
  <Button
    disabled={state.swimmers.length === 0}
    onClick={() => dispatch({ type: "START_RACE" })}
    className="gap-2 px-5"
  >
    <Play className="h-4 w-4" />
    Lancer
  </Button>
</div>
```

**Step 2 : Calculer le résumé du footer**

Dans le composant, ajouter :

```tsx
const footerSummary = useMemo(() => {
  const parts: string[] = [];
  if (state.swimmers.length > 0)
    parts.push(`${state.swimmers.length} nageur${state.swimmers.length > 1 ? "s" : ""}`);
  if (state.totalDistanceM > 0) parts.push(`${state.totalDistanceM} m`);
  if (state.splitDistanceM > 0) parts.push(`splits ${state.splitDistanceM} m`);
  if (parts.length === 0) return "Ajoutez des nageurs pour commencer";
  return parts.join(" · ");
}, [state.swimmers.length, state.totalDistanceM, state.splitDistanceM]);
```

**Step 3 : Modifier le `return` du composant**

Envelopper le contenu actuel dans un `<div className="relative">` et ajouter le footer sticky. Le composant doit retourner :

```tsx
return (
  <div className="flex flex-col gap-5 p-4 pb-24">
    {/* Titre */}
    {/* ... (inchangé) */}

    {/* Nageurs */}
    {/* ... (Tasks 1) */}

    {/* Compteur lignes + wave badges */}
    {/* ... (Task 1) */}

    {/* Programme (avec Avancé intégré) */}
    {/* ... (Tasks 2 + 3) */}

    {/* Sticky footer */}
    <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-background/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-4">
      <p className={`text-sm truncate ${
        state.swimmers.length === 0 ? "text-muted-foreground/60 italic" : "text-muted-foreground"
      }`}>
        {footerSummary}
      </p>
      <Button
        disabled={state.swimmers.length === 0}
        onClick={() => dispatch({ type: "START_RACE" })}
        className="gap-2 shrink-0"
      >
        <Play className="h-4 w-4" />
        Lancer
      </Button>
    </div>
  </div>
);
```

**Note importante :** Le `pb-24` sur la `div` principale empêche le footer de masquer le dernier élément. Ajuster si nécessaire (`pb-20` ou `pb-28`).

**Note :** `fixed` fonctionne correctement ici car `CoachChronoScreen` n'a pas de `overflow: hidden` sur son container. Si le footer est mal positionné (déborde dans d'autres panels), passer à `sticky bottom-0` avec `mt-auto` sur une `min-h-screen` flex column.

**Step 4 : Type check + tests**

```bash
npx tsc --noEmit && npm test
```
Attendu : 0 erreur TS, 262 tests passent (les tests existants sont de la logique pure, non affectés par les changements UI).

**Step 5 : Commit**

```bash
git add src/components/chrono/ChronoSetup.tsx
git commit -m "feat(chrono): sticky footer Lancer + suppression header CTA

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5 — Documentation §155

**Fichiers :**
- Modifier : `docs/implementation-log.md` — ajouter §155
- Modifier : `docs/ROADMAP.md` — ajouter ligne §155 + `*Dernière mise à jour : 2026-04-20*`
- Modifier : `docs/FEATURES_STATUS.md` — mettre à jour la ligne Chrono Coach
- Modifier : `CLAUDE.md` — mettre à jour "Dernière entrée en date : §155"
- Modifier : `docs/claude/files-map.md` — mettre à jour la taille de `ChronoSetup.tsx`

**Step 1 : Mesurer la taille de ChronoSetup.tsx**

```bash
wc -l src/components/chrono/ChronoSetup.tsx
```

**Step 2 : Ajouter §155 dans `docs/implementation-log.md`**

Suivre le pattern des entrées précédentes. Contenu minimal :

```markdown
## §155 — ChronoSetup : refonte progressive disclosure (2026-04-20)

**Contexte :** Complexité perçue trop élevée — toutes les options visibles simultanément.
Coaches occasionnels perdus face aux options vagues/intervalles/overrides.

**Changements :**
- Lane cards : bouton "+ Ajouter" intégré + ghost text sur lane vide + compteur sous les lanes
- Section "Programme" : preset chips Distance (50/100/200/400/800m) et Splits (25/50/100/200m)
- Section "Avancé" collapsible (Séries + Vagues + Intervalles) — repliée par défaut
  - État persisté dans `localStorage("eac-chrono-advanced-open")`
  - Badge résumé quand replié : "· 3 séries · 2 vagues"
- Sticky footer fixe : résumé "X nageurs · Y m · splits Z m" + bouton "Lancer"
- Suppression du header "Préparation" + bouton Lancer du header

**Fichiers modifiés :**
- `src/components/chrono/ChronoSetup.tsx` — refonte layout (~XXX lignes)

**Tests :** npx tsc --noEmit ✅ · npm test 262/262 ✅

**Décisions :**
- `fixed` pour le sticky footer (pas de overflow:hidden sur le parent CoachChronoScreen)
- Section "Avancé" à l'intérieur de la card Programme (cohésion thématique)
- Preset chips = pills simples, pas de composant dédié (YAGNI)

**Limites :**
- Sur très petits écrans (<375px), la grid 2 colonnes Programme peut être serrée — acceptable
```

**Step 3 : Mettre à jour les autres fichiers de suivi**

- `CLAUDE.md` l.74 : `Dernière entrée en date : §155 (ChronoSetup refonte progressive disclosure)`
- `docs/ROADMAP.md` : ajouter ligne `| §155 | ChronoSetup refonte progressive disclosure | 2026-04-20 | ✅ |`
- `docs/FEATURES_STATUS.md` : chrono setup → ✅ si marqué autrement
- `docs/claude/files-map.md` : mettre à jour la taille de `ChronoSetup.tsx` avec la valeur mesurée au Step 1

**Step 4 : Commit final**

```bash
git add docs/ CLAUDE.md
git commit -m "docs(chrono): §155 — ChronoSetup refonte progressive disclosure

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Wrap-up

**Sanity pass :**
```bash
npx tsc --noEmit   # → clean
npm test           # → 262 pass (pre-existing: TimesheetHelpers.test.ts)
git log --oneline -6
```

**Ne PAS :**
- Déployer localement (`npx gh-pages`) — pousser sur `main` uniquement
- Lancer `npm run test:rls` (zéro changement RLS)

**Résultat attendu :**
- Coach débutant : voit Nageurs + Distance + Splits → clique Lancer (3 actions)
- Coach expert : tape "Avancé" → retrouve Séries + Vagues + Intervalles
- Mobile bord de bassin : bouton "Lancer" toujours en bas, une main suffit
