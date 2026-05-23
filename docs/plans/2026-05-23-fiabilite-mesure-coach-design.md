# Design — Fiabilité & répétabilité de la mesure (Bilan Muscu, §301)

*Plan d'implémentation issu de l'audit `docs/audits/2026-05-23-audit-mesure-coach-robustesse.md`.
Périmètre validé le 2026-05-23 : **fiabilité de la mesure d'abord** (recos 1, 2, 5,
6, 7). La **fluidité du parcours coach** (recos 3, 4 : fil conducteur + intégration
KPI + done-state questionnaire) est **reportée à un §302** distinct.*

## 1. Objet

Rendre la séance de mesure coach-pilotée **fiable et répétable** : deux coachs (ou
le même à 3 mois) doivent obtenir des valeurs comparables. L'audit a montré que le
moteur et la persistance sont robustes ; le travail porte sur la **qualité du
guidage de la mesure** — au premier chef la **mobilité/amplitudes** (notées 0-3
sans rubrique ni référence), puis la **détente verticale** (chrono biaisé), les
**démos**, un **bug de saisie** (`weighted_pullup`) et la **visibilité de la
confiance des barèmes**.

## 2. Décisions de cadrage (validées)

| # | Décision | Choix retenu |
|---|----------|--------------|
| 1 | Périmètre | Recos **1, 2, 5, 6, 7** (fiabilité). Recos 3, 4 (fluidité coach) → **§302**. |
| 2 | Rubrique mobilité (reco 1) | **Descripteurs texte 0-3 par axe + repère chiffré + note du bilan précédent + photos de référence par niveau.** Pas de saisie goniométrique (schéma `physical_tests` inchangé). |
| 3 | Détente verticale (reco 6) | **Fix léger** : **moyenne** des 3 temps de vol (au lieu de `Math.max`) + **écart-type** affiché + KPI marqué « estimation ». Pas de capture vidéo pour l'instant. |

## 3. Découpage en tâches

Ordre d'exécution : **quick wins à faible risque d'abord** (T1→T3, suite verte en
continu), puis le **changement de comportement** (T4), puis le **morceau central**
(T5, le plus gros). Chaque tâche est livrable indépendamment.

---

### T1 — `weighted_pullup` : autoriser 0 et charges assistées (reco 5, BUG-1)

**Problème** : l'input strippe `−` (`KpiWizard.tsx:208`) et `parseAttempts` rejette
`≤ 0` (`kpiMeasurement.ts:23`), alors que le barème a des ancres ≤ 0
(`kpiBaremes.ts:189,203`). La médiane filles/débutants (0 kg, voire négatif) est
non mesurable.

**Approche** (TDD — fonctions pures testables d'abord) :
- `kpiMeasurement.ts` : généraliser le parsing. Soit un paramètre
  `{ allowNonPositive?: boolean }`, soit une fonction `parseSignedAttempts`.
  `bestAttempt` (= `Math.max`) reste correct (−5 kg > −10 kg = mieux).
- `KpiWizard.updateAttempt` / `VerticalJumpInputs` : autoriser un `−` **en tête
  uniquement** pour `weighted_pullup` (regex conditionnée au KPI courant). Les
  4 autres KPIs gardent le rejet de `−` et `≤ 0`.
- `KpiStepCard.GenericKpiInputs` : « valeur retenue » doit accepter 0/négatif pour
  ce KPI (le surlignage `isBest` ne doit plus exiger `numeric > 0`).

**Tests** : `kpiMeasurement.test.ts` — `weighted_pullup` accepte `-10`, `0`, `5` ;
les autres KPIs rejettent `-5` et `0`. **Pas d'UI nouvelle** (pas de
`/frontend-design`). **Pas de RLS.**

**Risque** : faible. Vérifier que `recordKpiMeasurement` / colonne `value` numeric
acceptent un négatif (numeric non contraint > 0 — à confirmer par un check schéma).

---

### T2 — Câbler les démos KPI existantes (reco 2)

**Problème** : `KPI_PROTOCOLS[*].gifUrl = null` → SVG systématique, alors que
`dim_exercices.illustration_gif` contient déjà des GIFs pour ≥ 3 mouvements KPI
(saut en longueur id 21, traction lestée id 13, lancer médecine-ball id 9).

**Approche** (résolution dynamique, auto-upgrade quand le catalogue change) :
- Ajouter une map `KPI_DEMO_EXERCISE_ID: Record<StrengthKpiKey, number | null>`
  (`kpiProtocols.ts`) — `broad_jump→21`, `weighted_pullup→13`,
  `medball_vertical_throw→9` ; `imtp` et `vertical_jump` → `null` (pas de match
  catalogue exact → SVG conservé).
- API : helper `getExerciseGifs(ids: number[]): Promise<Record<number,string|null>>`
  (`strength-catalog.ts` ou existant) — un seul `select id, illustration_gif`.
- `KpiWizard` : fetch les GIFs des IDs mappés une fois, passer l'URL résolue à
  `KpiStepCard` → `KpiGifPanel`.
- `KpiGifPanel` : priorité `gifUrl` (résolu) → sinon `KpiAnimatedIllustration`
  (fallback inchangé). Corriger le commentaire `:10` (devenu exact).

**Tests** : map KPI→exerciseId ; fallback SVG quand id `null` ou gif absent.
**UI** : ajustement mineur (l'`<img>` existe déjà) — **pas de `/frontend-design`**
nécessaire (pas de nouvelle composition visuelle). **Pas de RLS.**

**Note** : à terme, des clips bespoke pour `imtp` (hauteur de barre) et
`vertical_jump` (détente sèche, pas de tuck) amélioreraient encore la
standardisation — hors périmètre, à fournir par le coach.

---

### T3 — Confiance des barèmes par-KPI, au moment de la mesure (reco 7)

**Problème** : la fiabilité du barème n'est visible qu'à l'aperçu
(`MesocyclePreview.tsx:634-640`), agrégée (minimum), en enum brut. Le coach ne sait
pas, en mesurant, que 4/5 barèmes ne sont pas calibrés natation.

**Approche** :
- `kpiBaremes.ts` : exporter `baremeConfidenceFor(kpiKey): BaremeConfidence`
  (la confiance est invariante par sexe/âge pour un KPI donné — pas besoin du
  profil). Ajouter un libellé FR : `transposed`/`placeholder` → « barème non
  calibré natation — score indicatif » ; `solid` → « barème validé ».
- `KpiRecap.tsx` : badge de confiance **par KPI** sous la valeur.

**Tests** : `baremeConfidenceFor` renvoie la bonne confiance par KPI.
**UI** : petit badge dans le recap → passe par **`/frontend-design`** (cohérence
visuelle des badges). **Pas de RLS.**

---

### T4 — Détente verticale : moyenne + écart-type, marquer « estimation » (reco 6)

**Problème** : `verticalJumpResult` retient `Math.max(flightTimes)`
(`jumpPower.ts:94`) → sélectionne l'essai au plus grand bruit de chrono → **biais
systématique vers le haut** de la hauteur/puissance.

**Approche** (TDD — c'est un **changement de comportement**, mettre à jour les tests
existants) :
- `jumpPower.ts` : `verticalJumpResult` calcule la **moyenne** des temps de vol
  (au lieu du max) → hauteur → puissance. Ajouter au résultat l'**écart-type**
  (ou coefficient de variation) des temps de vol, et conserver les 3 temps dans
  `attempts` (déjà fait). Documenter le compromis « répétabilité > pic ».
- `VerticalJumpInputs.tsx` : libellé « Moyenne retenue » (au lieu de « Meilleur
  retenu ») ; afficher l'écart-type ; **avertir** si CV élevé (essais incohérents
  → refaire). Marquer le KPI « estimation (chrono manuel) ».
- Vérifier `KpiRecap` : la valeur (W/kg) reste comparable dans le temps (même
  méthode des deux côtés — OK, le changement s'applique aux futures mesures ; les
  anciennes valeurs `max` existantes en base sont nulles → aucun conflit, table
  vide en prod).

**Tests** : `jumpPower.test.ts` — `verticalJumpResult` utilise la moyenne ;
écart-type calculé ; **mettre à jour** les assertions qui supposaient le max.
**UI** : ajustement du readout → **`/frontend-design`** si le bloc évolue
visiblement (écart-type, avertissement). **Pas de RLS.**

**Risque** : moyen — changement de sémantique. Bien le **documenter**
(implementation-log + guide utilisateur §5). Alternative notée : médiane (encore
plus robuste aux essais aberrants) — à trancher en implémentation.

---

### T5 — Rubrique mobilité/mouvement 0-3 + photos + comparaison (reco 1) — **morceau central**

**Problème** : 6 axes notés 0-3 avec libellés **aux extrêmes seulement**, niveaux
1/2 indéfinis, aucune référence visuelle/chiffrée, aucune comparaison temporelle
(`assessmentScores.ts:34-95`, `StrengthAssessmentScreen.tsx:649-666`,
`AssessmentContext.tsx`).

**Approche** :

1. **Données de rubrique** (`assessmentScores.ts`) — étendre `AssessmentScoreItem` :
   ```ts
   levels: { 0: string; 1: string; 2: string; 3: string };  // descripteur observable par niveau
   chiffre?: string;       // repère chiffré quand pertinent (ex. doigts-mur en cm)
   refPhotos?: { 0?: string; 1?: string; 2?: string; 3?: string }; // chemins assets
   ```
   Remplir les **6 axes × 4 niveaux** = 24 descripteurs (contenu S&C — **draft par
   Claude, validation coach**), avec repère chiffré là où il existe
   (ex. flexion épaule : doigts touchent le mur = 3 ; 0-5 cm = 2 ; 5-15 cm = 1 ;
   > 15 cm = 0).

2. **Photos de référence** — **24 slots** (6 axes × 4 niveaux). Décision de
   stockage (à confirmer, cf. §5) : **`public/assessment-refs/<axe>-<niveau>.jpg`**
   bundlés (simple, pas de fetch, fallback gracieux si manquant) — recommandé — ou
   bucket Supabase `assessment-refs`. **Assets produits par le coach** ; le code
   marche sans (fallback texte, comme `KpiGifPanel`).

3. **UI de notation** (`StrengthAssessmentScreen.tsx`, via **`/frontend-design`
   obligatoire**) : pour chaque axe, sous le `ScaleField`, afficher le
   **descripteur du niveau sélectionné** (et un dépliant « Voir les 4 niveaux » avec
   photos), le repère chiffré, et la **note du bilan précédent** (badge « précédent :
   2 » + flèche d'évolution, à la manière de `KpiRecap`).

4. **Comparaison temporelle** — API : helper
   `getPreviousCompletedPhysicalTests(athleteId)` (`strength-assessments.ts`) qui
   lit le **dernier assessment `completed` antérieur** (mêmes RLS que les lectures
   existantes — **pas de nouvelle policy**). Afficher la note précédente par axe.

5. **Cohérence panneau coach** — `CoachMesocyclePanel` / `AssessmentContext`
   peuvent réutiliser les `levels` pour afficher le libellé d'un score (« 2 ·
   Correct » → descripteur réel) plutôt que le chiffre nu.

**Tests** : chaque axe a 4 descripteurs (`levels` complet) ;
`getPreviousCompletedPhysicalTests` renvoie bien l'antérieur `completed` (pas le
courant). **UI → `/frontend-design`.** **Pas de migration** (`physical_tests`
inchangé). **Pas de RLS** (lecture sur table déjà policée).

**Risque** : moyen-élevé (le plus gros). Dépendances **contenu coach** :
descripteurs + repères chiffrés (validation) + 24 photos.

---

## 4. Ce qui NE change PAS (et pourquoi)

- **Schéma DB** : aucune migration. `physical_tests` reste 6 scores 0-3 ; la
  rubrique et les photos sont du **contenu statique** ; la comparaison lit
  l'historique déjà stocké (append-only).
- **RLS** : aucune policy touchée → **`npm run test:rls` non requis** (cf. CLAUDE.md
  § règles tests RLS). T5 lit un assessment antérieur via les policies existantes.
- **Moteur** (`mesocycleEngine.ts`) : inchangé — la fiabilité se joue en amont
  (saisie), pas dans le calcul.

## 5. Points à trancher en implémentation

- **Stockage des 24 photos de référence** : `public/assessment-refs/` bundlé
  (recommandé : simple, offline, fallback gracieux) vs bucket Supabase
  `assessment-refs` (cohérent avec les GIFs catalogue). → **à confirmer**.
- **Détente** : moyenne (retenu) vs médiane (plus robuste aux aberrants). → arbitrer
  sur un jeu d'essais réels.
- **Descripteurs 0-3 et repères chiffrés** des 6 axes : **draft Claude → validation
  coach** (expertise S&C).

## 6. Dépendances contenu (côté coach / F. Wagner)

| Livrable | Pour | Bloquant ? |
|---|---|---|
| Validation des 24 descripteurs 0-3 + repères chiffrés | T5 | Non (draft fourni, affinable) |
| 24 photos de référence (6 axes × 4 niveaux) | T5 | Non (fallback texte ; à intégrer dès dispo) |
| Clips bespoke `imtp` / `vertical_jump` | T2 (bonus) | Non |

## 7. Découpage & exécution

Chantier multi-fichiers (lib pure + API + UI). Ordre : **T1 → T2 → T3 → T4 → T5**.
- T1, T2, T3 : faible risque, mergeables vite, suite verte en continu.
- T4 : changement de comportement → tests à mettre à jour + doc.
- T5 : centerpiece, à dérouler avec **`/frontend-design`** (rubrique + photos +
  comparaison) et le contenu coach.

Conforme à la règle globale d'**Agent Team** pour un chantier transverse :
orchestration Opus, dev Sonnet (lib/API/UI), tests Haiku — sur l'interface figée
tôt (types `AssessmentScoreItem` étendu, `VerticalJumpResult` étendu).

## 8. Clôture (workflow doc obligatoire)

Par § livré : entrée `implementation-log.md` (contexte/changements/fichiers/tests/
décisions/limites) ; `ROADMAP.md` (statut + `*Dernière mise à jour*`) ;
`FEATURES_STATUS.md` (fiabilité mesure ❌→⚠️→✅) ; `CLAUDE.md` (ligne « Dernier §
livré » + `files-map.md` si fichier > 150 l. créé/±30 %) ;
`bilan-muscu-guide-utilisateurs.md` (§5 détente = moyenne ; §3 rubrique mobilité).
Vérifs finales : `npx tsc --noEmit`, `npm test`, `npm run build`.

---

*Plan proposé le 2026-05-23 — à valider avant implémentation. Recos 3 & 4 (fluidité
parcours coach) feront l'objet du §302.*
