# Design — Parcours bilan coach unifié, enchaînable « Continuer → » + guidage amplitude

*Auteur : session du 2026-05-25. Statut : **validé** (coach), prêt pour plan d'implémentation.*
*Chantier A du prompt « muscu-followups » — workflow bilan→génération unifié, mené en une fois sur un seul appareil.*

---

## 0. Contexte & état actuel (le « pourquoi »)

Le coach mène le bilan d'un nageur tiers (questionnaire → KPIs → mobilité/mouvement → génération du mésocycle). Cible : **un parcours guidé unique**, contexte nageur persistant, fil d'avancement visible, CTA « Continuer → » à chaque étape, reprise possible.

**Ce qui existe déjà (à ne PAS réécrire) :**
- **§302** — `StrengthAssessmentScreen` (`/coach/strength-assessment/:athleteId`) est un hub avec une bande de progression 3 étapes tappable (`BilanProgress` + `computeBilanProgress` dans `bilanProgress.ts`), cible nageur persistante (routes param), et un CTA « Générer le mésocycle ». Le questionnaire (mode coach) et le `KpiWizard` (ciblé) **retournent au hub** après submit (`StrengthQuestionnaire.tsx:156-158`, `KpiWizard.tsx:463-465`).
- **§299** — autonomie/gating : génération débloquée dès `bilan_pending` (`mesocycleGating.ts`) ; questionnaire + génération paramétrés par `athleteId`.
- **§301 T5** — guidage mobilité/mouvement : pour chacun des **6 axes** (3 mobilité : flexion épaule, thoracique, hanche ; 3 mouvement), `assessmentScores.ts` porte une rubrique 0-3 (`levels` avec **références d'angle** : « ~30-45° », « ~50-60° »), `labelLow/High`, un `gauge` (protocole de mesure), rendus par `AssessmentScoreField` (descripteur du niveau choisi, dépliant 4 niveaux, **photos de référence en fallback — non fournies**, note du bilan précédent).

**Le vrai gap ressenti (validé coach) :**
1. **Trop d'allers-retours par le hub.** Malgré §302, le coach retombe sur le hub entre chaque étape et doit retapper la suivante → ça ne « coule » pas comme un parcours guidé.
2. **Guidage amplitude sans repère visuel.** Les rubriques §301 T5 sont **texte + angles uniquement** ; aucun repère visuel par niveau → la notation ROM 0-3 dérive d'un coach à l'autre (point faible de répétabilité signalé par l'audit `2026-05-23-audit-mesure-coach-robustesse`).

## 1. Décisions validées (Q&A coach)

| # | Décision | Choix |
|---|----------|-------|
| Q1 | Friction réelle | **Trop d'allers-retours** → vrai enchaînement linéaire « Continuer → » |
| Q2 | Reprise / saut | **Reprise auto à l'étape courante** (dérivée du statut) + **saut autorisé** (KPIs partiels, génération jamais bloquée) |
| Q3 | Approche d'orchestration | **A — flux multi-routes orchestré** (réutilise les écrans, ne réécrit rien) |
| Q4 | Guidage amplitude | **Illustrations animées SVG par axe + arcs d'angle** (pattern `KpiAnimatedIllustration`, sans asset photo) |

## 2. Approche retenue — A : flux multi-routes orchestré

Les écrans restent des **routes/pages indépendantes** (deep-linkables). Le « parcours » = la chaîne de navigations + un en-tête de progression partagé. Aucune réécriture des pages (surtout pas du gros `KpiWizard`). L'état d'étape est **dérivé** du statut de l'assessment + présence de KPIs → la reprise est gratuite (pas de machine à états persistante — YAGNI).

## 3. Architecture

### 3.A — Ordre canonique & résolveur (pur, testable)
**Questionnaire → KPIs → Physique → Génération.** Extension de `src/lib/strength/bilanProgress.ts` :
- `nextBilanStep(status, hasKpis)` → `'start' | 'questionnaire' | 'kpis' | 'physical' | 'generate' | 'done'` :
  - pas d'assessment → `start` (créer le bilan) ; `questionnaire_pending` → `questionnaire`
  - `bilan_pending` + `!hasKpis` → `kpis` ; `bilan_pending` + `hasKpis` → `physical`
  - `completed` → `generate`
- `computeBilanProgress` passe à **4 étapes** (ajout `generation`) pour le fil d'avancement (l'étape génération = `todo` jusqu'à `completed`, `current` ensuite).
- Tests `node:test` exhaustifs (chaque combinaison statut × hasKpis).

### 3.B — Câblage « Continuer → » (réutilisation)
Bascule de la navigation **post-submit en mode bilan-coach** vers l'étape suivante au lieu du hub :
- **Questionnaire (coach)** → « Continuer → Mesurer les KPIs » (`/coach/kpi-wizard/:id`). *(Aujourd'hui retombe sur le hub.)*
- **KpiWizard (ciblé)** → `/coach/strength-assessment/:id` = déjà l'étape Physique → **inchangé** (déjà le bon enchaînement).
- **Physique (assessment → `completed`)** → CTA proéminent « Continuer → Générer le mésocycle » (`/coach/mesocycle-generate/:id`). *(CTA déjà présent, rendu central.)*
- **Génération → aperçu → apply** → retour fiche nageur.

Marqueur de « parcours guidé » : on s'appuie sur le mode coach-ciblé existant (`isCoachTargeted` / `:athleteId`) — pas de nouveau flag nécessaire ; chaque écran déjà en mode ciblé affiche le « Continuer → » vers `nextBilanStep`.

### 3.C — En-tête de progression partagé
La bande `BilanProgress` (désormais 4 étapes) est rendue **en tête de chaque écran du parcours** (questionnaire coach, KpiWizard ciblé, assessment — déjà présent). Étapes faites tappables (relecture). Fil visible de bout en bout.

### 3.D — États
- **Reprise** : entrer dans le bilan (point d'entrée 3.E) → `nextBilanStep` → redirige sur la 1re étape incomplète. Dérivé du statut, zéro persistance.
- **Saut** : lien discret « Passer cette étape » sur les KPIs → avance au Physique. La génération n'est **jamais** bloquée par des KPIs manquants (`canGenerateMesocycle` dès `bilan_pending`) — confiance abaissée seulement.
- **Profil incomplet** (sex/birthdate → bloque la génération en fin de parcours, `MesocyclePreview` `ProfileIncompleteScreen`) : **bandeau d'alerte précoce** dès l'en-tête du parcours + lien pour compléter le profil → évite le cul-de-sac à la dernière étape.

### 3.E — Point d'entrée unique
Sur la fiche nageur (`CoachSwimmerFullView`), CTA **« Démarrer / Reprendre le bilan de {nom} »** → résolveur d'entrée → bonne étape (via `nextBilanStep`). Plus d'URL à taper ni de re-sélection du nageur.

### 3.F — Guidage amplitude / mobilité (visuel)
Pour fiabiliser la notation ROM 0-3, on ajoute un **repère visuel par axe** :
- **Illustrations SVG animées par axe** (flexion épaule, mobilité thoracique, mobilité hanche, + les 3 axes de qualité de mouvement) montrant le geste, avec des **arcs d'angle** matérialisant les seuils 0/1/2/3 (ex. arcs 30° / 45° / 60° pour la rotation thoracique, alignés sur les `levels` chiffrés existants de `assessmentScores.ts`).
- **Réutilise le pattern `KpiAnimatedIllustration` (§295)** : un dispatcher + un SVG inline par axe (`stroke-current`, keyframes namespacées), **sans asset photo à fournir**.
- Intégré dans `AssessmentScoreField` (le slot « photos de référence » devient le slot illustration), synchronisé avec le niveau sélectionné (surligner l'arc du niveau choisi).
- Cohérence : mêmes silhouettes monochromes que les démos KPI.

## 4. Où atterrissent les changements

| Fichier | Changement |
|---------|------------|
| `src/lib/strength/bilanProgress.ts` | `nextBilanStep(status, hasKpis)` + `computeBilanProgress` 4 étapes (génération) |
| `src/lib/strength/__tests__/bilanProgress.test.ts` | couverture `nextBilanStep` + 4e étape |
| `src/pages/StrengthQuestionnaire.tsx` | post-submit (coach) → KPIs ; en-tête `BilanProgress` |
| `src/pages/KpiWizard.tsx` | en-tête `BilanProgress` ; lien « Passer cette étape » (KPIs) ; (nav post-submit inchangée) |
| `src/pages/coach/StrengthAssessmentScreen.tsx` | CTA « Continuer → Générer » proéminent ; bandeau profil incomplet ; en-tête déjà présent |
| `src/pages/coach/CoachSwimmerFullView.tsx` | CTA d'entrée « Démarrer / Reprendre le bilan » |
| `src/components/strength/assessment/BilanProgress.tsx` | supporte 4 étapes (déjà générique) |
| `src/components/strength/assessment/AssessmentScoreField.tsx` | slot illustration animée par axe |
| `src/components/strength/assessment/illustrations/*` (NOUVEAUX) | SVG animés par axe + arcs d'angle (pattern §295) |
| `src/components/strength/assessment/assessmentScores.ts` | mapping axe → clé d'illustration (si besoin) |

## 5. Réutilisation / tests / mobile

- **Aucun écran réécrit.** Changements : navigation de sortie, libellés CTA, en-tête ajouté, résolveur pur, bandeau profil, CTA d'entrée, illustrations.
- **Tests** : `nextBilanStep` + `computeBilanProgress` 4 étapes → `node:test` (purs). UI non couverte (pas de jsdom) → vérif manuelle.
- **UI obligatoire via `/frontend-design`** : en-tête de progression sur les écrans, CTA « Continuer → » (footer sticky), lien « Passer cette étape », bandeau profil incomplet, illustrations animées par axe + arcs d'angle.
- **Mobile-first** (bord de bassin) : footer sticky « Continuer → », en-tête compact, zones de tap, safe-area. Les écrans le sont déjà.
- **Pas de migration, pas de RLS** : purement UI/navigation + helper pur (aucune policy/RPC/table touchée).

## 6. Acceptation (du brief)

Un coach mène le bilan complet d'un nageur tiers de bout en bout sans taper d'URL ni re-sélectionner le nageur, avec progression visible et CTA « Continuer → » ; reprise auto à l'étape courante ; saut d'étape possible ; profil incomplet signalé tôt ; **amplitude/mobilité guidée par illustration + arcs d'angle** ; aucun cul-de-sac ; mobile-first ; `tsc`/`npm test`/`npm run build` verts.

## 7. Séquencement (phases pour le plan d'implémentation)

1. **Résolveur** (`bilanProgress.ts` : `nextBilanStep` + 4e étape) — TDD `node:test`.
2. **Câblage « Continuer → »** + en-tête partagé + lien « Passer » + bandeau profil (via `/frontend-design`).
3. **Point d'entrée** fiche nageur (via `/frontend-design`).
4. **Guidage amplitude** : illustrations animées par axe + arcs d'angle dans `AssessmentScoreField` (via `/frontend-design`).
5. **Vérif** (`tsc`/`npm test`/`build`) + doc workflow (implementation-log + ROADMAP + FEATURES_STATUS + CLAUDE.md + files-map).

## 8. Doc workflow (à l'implémentation, règle projet)

Entrée `docs/implementation-log.md` (§ nouveau) + maj `docs/ROADMAP.md`, `docs/FEATURES_STATUS.md`, `docs/claude/files-map.md` (tailles `wc -l`), ligne « Dernier § livré » de `CLAUDE.md`. Pas de déploiement local ; push/merge sur demande explicite.
