# Design §358 — Bannière : report de la progression globale après ajustement

*Date : 2026-05-31 · Suite du retour terrain (ajustement méso François). Statut : design validé (brainstorming), prêt pour `writing-plans`.*

## Contexte / problème

L'ajustement mi-cycle (§338) crée un **nouveau** mésocycle démarrant à la date pivot, avec `target_week_count` = semaines **restantes**. La bannière « Mon plan » (`MyPlanMesocycleBanner`, §342) calcule `mesocyclePosition(start_week_monday, target_week_count, currentMonday)` → elle ne connaît que le nouveau bloc → affiche « Semaine 1/4 » / « Commence bientôt », perdant les semaines déjà entraînées avant le pivot (cas François : 2 sem. faites → devrait être « Semaine 3/6 »).

## Décisions verrouillées (brainstorming)

| # | Décision |
|---|----------|
| Affichage | « Semaine globale X/Total » = offset reporté (ex. « Semaine 3/6 ») |
| Offset | Colonne `strength_mesocycles.week_offset` (défaut 0), stockée à l'ajustement |
| Statut pré-pivot | `week_offset>0` → **continuation** (jamais « Commence bientôt ») |
| Rétrocompat | offset 0 (mésos existants / génération normale) = comportement actuel |

## A. Data — migration `00220_mesocycle_week_offset.sql` (MCP)
- `ALTER TABLE strength_mesocycles ADD COLUMN week_offset int NOT NULL DEFAULT 0`.
- **Pas** de modif de `apply_strength_mesocycle` (la grosse RPC table-rase) — l'offset est posé par un UPDATE ciblé post-apply.
- Backfill one-off : `UPDATE strength_mesocycles SET week_offset = 2 WHERE id = 'c9c42226-…'` (méso actif de François, 2 sem. faites avant le pivot) → « Semaine 3/6 » immédiat.

## B. API
- Nouveau `setMesocycleWeekOffset(mesocycleId: string, weekOffset: number): Promise<void>` (`strength-mesocycles.ts`) — UPDATE `strength_mesocycles SET week_offset` (RLS coach/admin), no-op si Supabase indispo.
- Le type `StrengthMesocycle` (lecture) + `getActiveMesocycle`/`getMesocycle`/`listMesocycles` exposent `week_offset` (mapper le select).

## C. Câblage ajustement
- `MesocycleAdjust` : ajouter `weekOffset: phaseInfo.weekIndex` au payload sessionStorage `eac_pending_mesocycle_params` (weekIndex = semaines écoulées au pivot, déjà calculé).
- `MesocyclePreview` : `applyMesocycle` renvoie l'id du nouveau méso ; dans `applyMutation.onSuccess`, **si** `params.adjust && params.weekOffset > 0` → `await setMesocycleWeekOffset(newMesoId, params.weekOffset)` puis invalider `["strength-mesocycle-active", athleteId]`. Échec toléré (offset reste 0 → numérotation locale).

## D. Moteur d'affichage (pur, TDD)
`mesocyclePosition(startMonday, totalWeeks, currentMonday, weekOffset = 0)` :
```
elapsed = round((current − start)/semaine)
globalTotal = totalWeeks + weekOffset
globalRaw = (elapsed + 1) + weekOffset
status =
  weekOffset > 0
    ? (globalRaw > globalTotal ? 'done' : 'active')   // continuation : jamais 'upcoming'
    : (rawLocal < 1 ? 'upcoming' : rawLocal > totalWeeks ? 'done' : 'active')
weekNumber = clamp(globalRaw, 1, globalTotal)
return { weekNumber, totalWeeks: globalTotal, status }
```
`MyPlanTab` passe `activeMesocycle.week_offset ?? 0` à `mesocyclePosition`. La bannière (déjà branchée sur `weekNumber`/`totalWeeks`/`status`) affiche « Semaine 3/6 » + barre cohérente ; « Commence bientôt » ne sort plus que pour un méso neuf (offset 0) avant son début.

## E. Tests
- `mesocycleProgress.test.ts` (node:test) : offset>0 → continuation active + « 3/6 » avant et après pivot ; offset+plan terminé → `done` ; **offset=0 inchangé** (régression des cas §341/§342).
- `setMesocycleWeekOffset` : test mocké (rpc/update appelé avec bons args ; no-op offline).
- `MyPlanMesocycleBanner.vitest.tsx` : avec offset → libellé « Semaine 3/6 », statut actif (pas « Commence bientôt »).
- tsc 0, lint 0, build OK. Pas de RLS nouvelle (UPDATE sur table existante sous policy coach/admin) → vérifier si `test:rls` requis (UPDATE sur colonne d'une table déjà couverte ; probablement non — la policy existante s'applique).

## Frontières
- Offset cumulatif géré naturellement (un 2ᵉ ajustement repart de `weekIndex` global du méso alors actif). Pas de refonte du modèle méso.
- Pas de changement de la RPC apply ni de la matérialisation.

## Doc
`implementation-log.md` §358 ; ROADMAP ; FEATURES_STATUS ; CLAUDE.md ; files-map (si applicable) ; mémoire (limite UX bannière post-ajustement → résolue).
