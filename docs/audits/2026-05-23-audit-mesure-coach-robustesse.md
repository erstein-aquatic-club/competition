# Audit mesure coach + robustesse génération — 2026-05-23

*Audit **lecture seule** (aucune modification de code) du parcours intégral Bilan
Muscu → Mésocycle, focalisé sur (1) la **fiabilité & répétabilité de la séance de
mesure coach-pilotée** et (2) la **robustesse de la génération**, avec revue
transverse de tous les parcours UI/UX (nageur + coach, tous états).*

> Méthode : lecture des docs (guide produit, plans, 2 audits antérieurs §293 /
> 2026-05-23-parcours), parcours du code mesure+moteur, 9 requêtes SQL prod
> (`fscnobivsgornxdwqwlk`), `tsc` / `npm test` / `build`. Les findings déjà fermés
> par §294 / §299 / §300 ont été **vérifiés clos** (annexe D) et ne sont **pas
> re-signalés** comme bugs.

---

## Synthèse exécutive

- **Fiabilité / répétabilité des mesures : ⚠️→❌ selon le KPI.** Le parcours est
  *guidé* (protocoles affichés, rôle du binôme, illustrations animées, chrono
  intégré, diff vs mesure précédente). Mais **la répétabilité n'est pas garantie**
  sur les axes les plus sensibles : (a) la **détente verticale** repose sur un
  temps de vol chronométré **à la main** dont le bruit (réaction humaine
  ~150-250 ms) domine la mesure et que le « meilleur de 3 » **biaise vers le
  haut** ; (b) le **lancer médecine-ball** est une **estimation à l'œil** sans
  repère ; (c) l'**évaluation mobilité/mouvement** est une note 0-3 dont **seuls
  les niveaux 0 et 3 sont définis** (1 et 2 sans description), **sans référence
  visuelle ni goniométrique** → dérive inter-coach assurée. 4 barèmes KPI sur 5
  ne sont **pas sourcés natation** (3 `transposed`, 1 `placeholder`).

- **Séance coach-pilotée (fluidité 1 appareil) : ⚠️ pièces présentes, fil
  conducteur rompu.** §299 a câblé questionnaire-coach et génération-coach
  (vérifié). Mais **l'étape KPI est orpheline** du flux coach (aucun lien depuis
  l'écran bilan ; la seule entrée KPI est une tuile du module nageur `/strength`),
  et le **retour questionnaire→notation est un cul-de-sac** (après le
  questionnaire coach, on atterrit sur la fiche nageur, pas sur l'écran de
  notation ; le texte affiché est celui du nageur). La **cible nageur n'est pas
  partagée** entre les écrans : on re-sélectionne le nageur à chaque brique.

- **Robustesse génération : ✅.** Données partielles tolérées (preuve prod :
  l'unique mésocycle a été généré **avec 0 KPI** → `data_confidence: low`, 4 seaux
  `null`, sans blocage). 14 templates cohérents (Σmin/Σmax alignés). `is_core`
  nettoyé. Édition coach préserve `mesocycle_id` (revert cohérent). tsc 0 /
  **935 tests verts** / build OK.

- **UI/UX (2 rôles, tous états) : ✅ pour les états, ⚠️ pour le fil coach.**
  Vide / chargement / erreur+retry / profil incomplet / catalogue vide / KPI
  partiels : tous gérés proprement, mobile-first (focus mode, safe-area, sticky).
  Le point faible est l'enchaînement coach (cf. ci-dessus), pas les états.

### Top 3 frictions prioritaires

1. **Amplitudes & qualité de mouvement notées sans repère** (fiabilité) — slider
   0-3 avec libellés **uniquement aux extrêmes**, pas de rubrique par niveau, pas
   de photo/schéma/seuil chiffré, **pas de comparaison dans le temps**.
   → c'est l'angle mort n°1 pour « fiable et répétable » (impact 🔴 · effort moyen).
2. **Démos KPI riches existantes mais non câblées** — les 5 protocoles ont
   `gifUrl: null` (donc fallback SVG stick-figure), alors que `dim_exercices`
   **possède déjà des GIFs** pour ≥ 2 mouvements KPI (saut en longueur, traction
   lestée). Le wizard lit le champ statique, pas la colonne DB (impact 🟠 · effort
   faible).
3. **Étape KPI orpheline du flux coach + cul-de-sac questionnaire→notation** — pas
   de « fil conducteur » sur un seul appareil ; le coach jongle entre écrans et
   re-sélectionne le nageur à chaque brique (impact 🟠 · effort faible-moyen).

---

## 1. Fiabilité & répétabilité des mesures

### 1.1 KPIs (×5) — protocole · démo · chrono · barème · historisation

| KPI | Protocole (clarté/standardisation) | Démo | Barème | Répétabilité réelle |
|---|---|---|---|---|
| **Saut en longueur** (`broad_jump`, cm) | Net, peu ambigu (`kpiProtocols.ts:40-53`). Mètre ruban. | SVG (GIF dispo `dim_exercices.id=21`, non câblé) | **`solid`** (Petrigna 2020) | ✅ **Bonne** — mesure objective, barème sourcé. |
| **Traction lestée** (`weighted_pullup`, kg) | Net (`:72-86`). Charge additionnelle objective. | SVG (GIF dispo `id=13`, non câblé) | `transposed` | ⚠️ Mesure objective **mais** input bloque les faibles (cf. **BUG-1**). |
| **Tirage mi-cuisse** (`imtp`, kg) | « Pins réglés à hauteur mi-cuisse » (`:57-71`) — **hauteur de pin non enregistrée** → setup non reproductible à 3 mois. | SVG | `transposed` | ⚠️ Moyenne — dépend d'un réglage non tracé. |
| **Détente verticale** (`vertical_jump`, W/kg) | Protocole soigné (jambes tendues, pas de tuck `:28-37`). Mais **temps de vol chrono manuel**. | SVG | `transposed` | ❌ **Faible** — voir 1.2. |
| **Lancer médecine-ball** (`medball_vertical_throw`, cm) | Binôme « **estime** la hauteur max » à l'œil (`:97`), **sans repère mural marqué**. | SVG | **`placeholder`** | ❌ **Faible** — estimation visuelle + barème non calibré. |

**Barèmes** (`kpiBaremes.ts`) : **1/5 `solid`** (`broad_jump`), **3/5 `transposed`**
(`vertical_jump`, `imtp`, `weighted_pullup`), **1/5 `placeholder`**
(`medball_vertical_throw`). Le flag de confiance **est** affiché — mais seulement
dans l'**aperçu mésocycle** (`MesocyclePreview.tsx:634-640` : « Fiabilité des
barèmes : `{lowestBaremeConfidence}` ») et de façon **agrégée** (le minimum parmi
les KPI), en **valeur brute d'enum** (`placeholder`/`transposed`/`solid`) sans
explication, et **jamais au moment de la mesure** (le recap wizard montre la
valeur brute + le delta, pas le score ni la confiance — `KpiRecap.tsx:158-209`).

**Démos** : les 5 protocoles ont `gifUrl: null` (`kpiProtocols.ts:38,52,70,85,99`)
→ `KpiGifPanel` (`:37`) rend systématiquement l'illustration SVG animée
(stick-figure, ex. `VerticalJumpAnim.tsx`). Ces SVG transmettent le **geste
global** mais pas les **conditions de mesure** (hauteur de barre, position exacte
du médecine-ball). Le commentaire de `KpiGifPanel.tsx:10` promet qu'un
`UPDATE dim_exercices.illustration_gif` remplacerait l'animation — **c'est faux** :
le panel lit `protocol.gifUrl` (statique), pas la colonne DB. Or la colonne DB
contient déjà des GIFs pour les mouvements KPI (annexe B, requête 5.2).

**Chrono** (`KpiStopwatch.tsx`) : `performance.now()` (sub-ms) — mais la précision
de l'horloge **n'est pas** le facteur limitant. Le facteur limitant est le **temps
de réaction de l'opérateur** au décollage et à l'atterrissage. Aucune atténuation
de ce biais.

**Historisation KPI** : ✅ **présente et bien faite.** Le recap diffe chaque KPI
contre la mesure précédente (`getLatestKpiMeasurements` → `KpiRecap`), gère
proprement le changement d'unité cm→W/kg (`KpiRecap.tsx:149-153`) et affiche
`+Δ`/`1ère mesure`. La série temporelle `strength_kpi_measurements` est
append-only.

### 1.2 Le point dur de la détente verticale (BUG conceptuel de répétabilité)

`jumpPower.ts` : `h = g·t²/8` puis Sayers `P = 60,7·h + 45,3·m − 2055`. La hauteur
est **quadratique** en temps de vol : `dh/dt = g·t/4`. Pour un vol typique
t ≈ 0,50 s → h ≈ 31 cm ; une **erreur de 0,15 s** (réaction humaine) donne
t = 0,65 s → h ≈ 52 cm, soit **+68 % de hauteur** et une puissance W/kg fortement
sur-estimée. Pire : `verticalJumpResult` retient `Math.max(...flightTimes)`
(`jumpPower.ts:94`, `VerticalJumpInputs.tsx:56`) → le « meilleur de 3 » sélectionne
**le temps le plus long**, c'est-à-dire l'essai où l'opérateur a, par hasard,
**déclenché trop tôt / arrêté trop tard** → **biais systématique vers le haut**.
Deux opérateurs (ou le même à 3 mois) obtiendront des W/kg non comparables.

**Atténuations possibles** (hors périmètre, à instruire) : capture vidéo
slow-mo (type *My Jump*), tapis de contact, ou — sans matériel — **moyenne** des
3 essais plutôt que le max + consigne de déclenchement stricte. En l'état, ce KPI
est le moins fiable des 5.

### 1.3 BUG-1 — `weighted_pullup` : impossible de saisir 0 ou une charge assistée

Le barème `weighted_pullup` est défini **avec des ancres ≤ 0** (charge négative =
traction assistée à l'élastique ; `kpiBaremes.ts:189` → F 13-14 : `[-10, 10] …
[0, 50]`). C'est intentionnel : la médiane filles est à **0 kg** (1 traction au
poids de corps) et p10 à **−10 kg**. **Mais l'UI rend ces valeurs inatteignables** :

- `KpiWizard.updateAttempt` nettoie l'input avec `value.replace(/[^\d.,]/g, "")`
  (`KpiWizard.tsx:208`) → **le signe `−` est strippé**.
- `parseAttempts` rejette tout `n ≤ 0` (`kpiMeasurement.ts:23`).

Conséquence : un nageur qui fait **exactement 1 traction au poids de corps**
(charge = 0, soit la **médiane** de plusieurs bandes) ou qui a besoin d'**aide**
(charge négative) **ne peut rien enregistrer** → le KPI est sauté → seau
`upper_strength = null` → traité conservativement comme 0. La population
**exactement visée par le barème** (ados, filles, débutants) est celle qu'on ne
sait pas mesurer. **Sévérité : 🟠 moyen** (mesure faussée pour un sous-groupe
identifiable).

### 1.4 Mobilité & amplitudes — rubriques, référence visuelle, répétabilité

C'est **l'angle mort principal** pour « fiable et répétable ». Le coach note
6 axes (3 mobilité + 3 mouvement) sur une échelle **0-3** via `ScaleField`
(`StrengthAssessmentScreen.tsx:649-666`). Le guidage fourni par axe
(`assessmentScores.ts:34-95`) se limite à :

- un **`hint`** d'une ligne (« Amplitude bras au-dessus de la tête, dos plaqué au
  mur. ») ;
- deux légendes **aux extrêmes seulement** : `labelLow` (« 0 · Très limitée ») et
  `labelHigh` (« 3 · Complète ») ;
- une légende générique d'échelle (`SCORE_LEGEND` : 0 Dysfonctionnel · 1
  Insuffisant · 2 Correct · 3 Optimal).

**Ce qui manque pour la répétabilité** :

- **Les niveaux 1 et 2 ne sont pas définis par axe.** « Insuffisant » vs
  « Correct » sur la flexion d'épaule = jugement libre du coach. Deux coachs
  divergeront mécaniquement sur la zone médiane (où tombent la plupart des nageurs).
- **Aucune référence visuelle** (photo/schéma par niveau) ni **repère chiffré**
  (angle goniométrique, distance doigts-mur, profondeur de squat en cm). Une
  amplitude « notée à l'œil » dérive d'un coach à l'autre et d'une saison à
  l'autre.
- **Aucune démonstration de la position de test** (le SVG/GIF n'existe que pour
  les 5 KPIs de force, pas pour les 6 axes de mobilité/mouvement).
- **Aucune comparaison dans le temps.** L'écran affiche le questionnaire et les
  KPIs en contexte (`AssessmentContext`, `StrengthAssessmentScreen.tsx:689-692`)
  mais **jamais les notes de mobilité précédentes**. Chaque bilan crée une
  nouvelle ligne (athlète 1 a 2 assessments en base) — donc l'historique **existe
  en base** mais n'est **pas surfacé** : impossible de voir « épaule 1→2 ».

> **Dispositif minimal pour rendre la mobilité répétable** (recommandation 1) :
> enrichir `assessmentScores` avec une **rubrique 0/1/2/3 explicite par axe**
> (descripteur observable de chaque niveau), idéalement **une photo de référence
> par niveau** et/ou un **repère chiffré** (ex. flexion épaule : doigts touchent
> le mur = 3 ; 0-5 cm = 2 ; 5-15 cm = 1 ; > 15 cm = 0), et **afficher la note
> précédente** à côté de chaque slider. Optionnel : champ goniométrique libre.

### 1.5 Saut d'un test / bilan partiel

✅ Bien géré des deux côtés. Wizard : « Passer ce KPI », bandeau « le bilan
partiel est accepté » (`KpiWizard.tsx:692-696`), retry scoping append-only sans
duplication (`:245-249`). Moteur : `null → 0` conservateur, `data_confidence`
abaissée (validé en prod, §4). Coach : la notation exige les 6 axes
(`allScored`, `StrengthAssessmentScreen.tsx:734`) — choix défendable (un bilan
physique partiel a peu de sens), mais c'est le **seul** point où la mesure est
bloquante.

---

## 2. Séance coach-pilotée bout-en-bout

### 2.1 Schéma du flux réel (un seul appareil)

```
[COACH] Hub coach → tuile « Bilan muscu »  (Coach.tsx:466)
   → /coach/strength-assessment
   → sélectionne le nageur (étape 1)                         ① sélection nageur #1
   → branche selon le statut :
       • absent/completed  → « Démarrer un bilan »  (createAssessment)
       • questionnaire_pending → « Remplir avec le nageur »
            → /coach/questionnaire/:athleteId                ② questionnaire (cible OK)
            → submit → DONE-STATE « Questionnaire déjà rempli »
                       texte = NAGEUR, bouton « Retour à la muscu »
                       → /coach/swimmer/:id   ◀── CUL-DE-SAC : pas de retour notation
       • bilan_pending → formulaire notation 6×0-3 + contexte
            → submit → DONE-STATE « Bilan complété »
                       → « Générer le mésocycle »
                            → /coach/mesocycle-generate/:athleteId   ③ (cible OK)
                            → aperçu → confirmer → /coach/swimmer/:id

   ⟂ ÉTAPE KPI : AUCUN lien depuis ce flux.
     Seule entrée = tuile « Bilan KPIs de force » du module NAGEUR /strength
     (Strength.tsx:1076). Le coach doit quitter le hub, ou taper l'URL
     /strength/kpi-wizard, où il re-sélectionne le nageur (étape select-athlete) ④ sélection #2
```

### 2.2 Frictions (fichier:ligne)

| # | Friction | Type | Preuve | Sévérité |
|---|----------|------|--------|----------|
| F1 | **Étape KPI orpheline du flux coach.** Le hub coach n'a qu'une entrée « Bilan muscu » → notation physique. Aucun lien vers le KPI wizard ; la seule tuile KPI est dans le module nageur. | gap | `Coach.tsx:466` (entrée unique) ; `StrengthBilanEntry.tsx:81-102` rendue seulement par `Strength.tsx:1076` | 🟠 |
| F2 | **Cul-de-sac questionnaire→notation (coach).** Après le questionnaire coach, le done-state n'offre que « Retour à la muscu » → fiche nageur, **pas** « Noter le bilan physique ». | friction | `StrengthQuestionnaire.tsx:153-154` (`closeScreen`→`/coach/swimmer/:id`), `:280` (bouton unique) | 🟠 |
| F3 | **Done-state questionnaire = texte nageur en mode coach.** Le titre/sous-titre affichent « Ton auto-évaluation… Ton coach réalisera le bilan physique » même quand c'est le coach qui vient de remplir. Le toast est adapté (`:198-201`), mais l'écran persistant non. | friction (copie) | `StrengthQuestionnaire.tsx:265-285` (branche `isDone` ne teste pas `isCoachMode`) | 🟡 |
| F4 | **Cible nageur non partagée.** Chaque brique re-sélectionne : KpiWizard a sa propre étape select-athlete, StrengthAssessmentScreen aussi, la génération passe par l'URL. Pas d'état « bilan en cours pour X » porté entre écrans. | friction | `KpiWizard.tsx:113-117` ; `StrengthAssessmentScreen.tsx:161` ; `MesocycleGeneration.tsx:151-155` | 🟡 |
| F5 | **Pas de fil conducteur / progression d'ensemble.** Aucun « étape 1/4 » ni état d'avancement du bilan (questionnaire ✓ · KPI ✗ · physique ✗) visible. Le coach doit se souvenir de ce qui reste. | gap | absence (aucune vue d'orchestration ; entrées indépendantes) | 🟡 |

> **Verdict 4.2** : les briques de la « session 30-60 min pilotée par le coach »
> **existent** (§299) mais ne forment **pas un parcours guidé**. Le ping-pong
> d'appareils dénoncé par l'audit du 2026-05-23 est résolu *pour le questionnaire
> et la génération* ; il **persiste pour les KPI** (orphelins) et l'enchaînement
> reste **manuel** (re-sélection + navigation à la main entre 3-4 écrans).

---

## 3. Parcours intégral & états (2 modes)

### 3.1 Nageur autonome — ✅ débloqué (§299, vérifié)

- `StartBilanEntry` amorce le bilan seul (`createAssessment` avec
  `coach_id: null`, `StrengthBilanEntry.tsx:113-184`). **Preuve prod** : athlète 1
  a un assessment `coach_id = null`, `bilan_pending`, auto-démarré le 2026-05-23.
- `canGenerateMesocycle` autorise dès `bilan_pending` (`mesocycleGating.ts:20-22`).
- Bandeau « confiance réduite » à l'aperçu si `bilan_pending`
  (`MesocyclePreview.tsx:624-631`). ✅ Mode A réalisé.

### 3.2 Coach-piloté — ⚠️ (cf. §2 : pièces OK, fil rompu, KPI orphelin)

### 3.3 États par écran (vide / chargement / erreur / profil incomplet)

| État | Traitement | Verdict |
|---|---|---|
| Chargement | Skeletons dédiés (`StrengthAssessmentScreen.tsx:416-428`, `StrengthQuestionnaire.tsx:242-255`, `MesocyclePreview`) | ✅ |
| Erreur réseau | Écran erreur + « Réessayer » (invalidate) (`StrengthAssessmentScreen.tsx:433-460`, `StrengthQuestionnaire.tsx:291-319`) | ✅ |
| Vide (jamais de bilan) | Nageur : `StartBilanEntry` (plus de cul-de-sac KPI) ; Coach : CTA « Démarrer » | ✅ (vs ❌ audit précédent) |
| Profil incomplet (sex/birthdate) | Écran « Profil incomplet » au lieu de planter (`MesocyclePreview.tsx:367,1104`) | ✅ |
| Catalogue vide | `EngineErrorScreen` explicite (`MesocyclePreview.tsx:392`) | ✅ |
| KPI partiels / aucun | Toléré (moteur `null→0`, confiance abaissée) | ✅ |
| Hand-off sessionStorage indispo (private mode) | Aperçu rebondit vers la génération (`MesocyclePreview.tsx:158,223`) au lieu de crasher | ✅ |

**Donnée prod** : profils incomplets = **4/15, tous des coachs** (0 athlète) — le
pipeline barème n'est bloqué pour **aucun nageur réel** (amélioration vs §293 qui
notait 1 nageur incomplet ; annexe B requête 5.7).

### 3.4 Mobile / a11y

- **Mobile-first** : focus mode (dock masqué via `document.body.dataset.focusMode`
  sur wizard/questionnaire/assessment), `pt-[max(...,env(safe-area-inset-top))]`,
  sticky bars top+bottom, `max-w-md`, zones de tap ≥ 44 px (`h-14` boutons). ✅
- **a11y** : `ScaleField` = `<button aria-pressed>` honnêtes dans `role="group"`,
  rationale documentée pour ne pas mentir sur `radiogroup`
  (`ScaleField.tsx:19-23`). Chrono : `aria-live="polite"` sur le readout,
  `aria-label` sur start/stop (`KpiStopwatch.tsx:106,135,169`). Bon niveau de base.

---

## 4. Robustesse de la génération

| Axe | État | Preuve |
|---|---|---|
| **Données partielles** | ✅ Ne bloque jamais | **Prod** : unique mésocycle généré **avec 0 KPI** → `bucket_priorities.dataConfidence = "low"`, 4 seaux entraînables `null`, mobilité=100, psy=66,7 ; statut `active` (annexe B requête sur `strength_mesocycles`). Le moteur a tourné sur mobilité+psy seules. |
| **Templates** | ✅ Cohérents | Les **14** templates : `min_week_count = Σmin` ET `max_week_count = Σmax` (annexe B requête 5.5). Finding B de §293 (Σmax=17≠16 sprint_50) **clos par §294** (8-16, Σmax=16). |
| **`is_core`** | ✅ Nettoyé | `upper_strength` cores **14 → 7** ; les 7 restants sont des **piliers** (Tractions prise neutre, lestées, Dips, Bench Pull, Pike Push-Up, Front Lever) + ajout d'un **pilier débutant** (`Tractions élastiques`, id 95). Le gainage hérité §291 (L-Sit, Ab Wheel, Hollow Body…) est sorti. Finding A de §293 **clos par §294**. |
| **Édition coach (§300)** | ✅ Revert cohérent | `reconcileMesocyclePayloads` impose `mesocycle_id` à **tous** les items (édités **et** ajoutés) si la séance appartient à un mésocycle ; hors mésocycle, `raw_payload` rendu tel quel — **aucun chemin ne réintroduit `raw_payload:null`** (`mesocycleItemPayload.ts:40-52`). |
| **Métriques d'intensité non-poids (§298)** | ✅ Présent | `mesocycleEngine.ts` porte la logique d'intensité par cycle ; `target_intensity` / gating 1RM câblés. |
| **Cohérence aperçu↔timeline↔coach** | ✅ | Planning coach mode athlète = `MyPlanTab` read-only (même rendu nageur) ; aperçu et panneau coach lisent le même `raw_payload`. |
| **Idempotence apply/revert** | ✅ (validé §293) | RPC `SECURITY DEFINER`, snapshot avant écriture, supersede des `active`, restore `ON CONFLICT DO UPDATE`. Non re-testé cette session (pas de changement RLS). |

**Note data-quality (mineure)** : `strength_assessments.data_confidence` vaut
`full` sur les 2 assessments prod alors que `bucket_scores IS NULL` et qu'il
n'y a **aucun** KPI → la colonne est un **défaut non recalculé** (la confiance
réelle est dérivée à l'aperçu/à la génération, comme l'a noté §293). Sans impact
utilisateur (l'aperçu recalcule), mais la colonne ne fait pas autorité.

---

## 5. Parcours UI/UX (par écran)

| Écran | Mobile | États | Navigation | a11y |
|---|---|---|---|---|
| `KpiWizard` | ✅ focus mode, sticky, dots progression | ✅ retry append-only, exit-confirm | select-athlete (coach) → steps → recap | ✅ aria sur chrono |
| `KpiStepCard` / `VerticalJumpInputs` | ✅ inputs `h-14`, `inputMode=decimal` | chrono ↔ fallback texte | — | ⚠️ `−` strippé (BUG-1) |
| `StrengthAssessmentScreen` | ✅ | ✅ loading/error/empty/4 branches statut | done → « Générer le mésocycle » ✅ | ✅ `aria-describedby` hint |
| `StrengthQuestionnaire` | ✅ | ✅ loading/done/error/empty/defensive | ⚠️ done-state coach = texte nageur + retour fiche (F2/F3) | ✅ |
| `MesocycleGeneration` | ✅ | ✅ gating `canGenerateMesocycle` | ✅ cible `:athleteId`, hand-off sessionStorage | ✅ |
| `MesocyclePreview` | ✅ semaines repliées par défaut | ✅ profil incomplet / catalogue vide / payload manquant | ✅ apply → fiche nageur (coach) | ✅ |
| Mobilité (`ScaleField`) | ✅ | — | — | ✅ mais **guidage sémantique pauvre** (1.4) |

Pas de cul-de-sac d'**état** détecté. Le seul cul-de-sac de **navigation** est
F2 (questionnaire coach → fiche nageur sans retour notation).

---

## 6. Sécurité / RLS / perf

- **`pain_coach_write`** présente et correcte : `cmd=ALL`, `USING` et `WITH CHECK`
  = `app_user_role() IN ('coach','admin')` — **pas** d'`auth.uid()` en subquery
  (annexe B requête 5.6b). Le questionnaire coach écrit bien les `pain_reports`
  du nageur cible via `upsertPainReports(effectiveAthleteId, …)`
  (`StrengthQuestionnaire.tsx:188`). ✅
  - *Observation (non-finding)* : la policy est **club-wide** sans scope
    par-athlète (un coach peut écrire le `pain_reports` de n'importe quel user) —
    cohérent avec le pattern coach existant (`strength_assessments`,
    `strength_kpi_measurements` FOR ALL coach). Pas de test d'intégration RLS
    dédié à `pain_coach_write` (confirmé par revue §299) — à ajouter si on durcit.
- **Perf** : index `raw_payload->>'mesocycle_id'` (§294) en place ; volume
  d'INSERT par apply raisonnable. Non re-mesuré (1 mésocycle prod).

---

## Écart existant ↔ cible

| Capacité visée | État | Gap |
|---|---|---|
| Coach mesure un nageur **de façon fiable** en 1 séance | ⚠️ | Mesures objectives OK (broad jump, pull-up*, IMTP*) ; **détente & medball peu fiables**, **mobilité sans rubrique/référence** |
| Mesure **répétable** (2 coachs / +3 mois comparables) | ❌ pour mobilité & détente | Pas de rubrique 0-3 par niveau, pas de repère visuel/chiffré, chrono manuel biaisé, setup IMTP non tracé |
| **Suivi dans le temps** des KPIs | ✅ | Diff vs précédent dans le recap |
| **Suivi dans le temps** de la mobilité/mouvement | ❌ | Historisé en base mais **jamais affiché** en comparaison |
| Flag de confiance des barèmes **visible** | ⚠️ | Visible à l'aperçu (agrégé, enum brut), **pas à la mesure**, pas par-KPI |
| Démos de protocole **présentes** | ⚠️ | SVG (geste global) ; GIFs riches en base **non câblés** au wizard |
| Séance **pilotée coach** sur 1 appareil, guidée | ⚠️ | Questionnaire+génération câblés (§299) ; **KPI orphelin**, **enchaînement manuel**, cible non partagée |
| Génération **robuste** sous données partielles | ✅ | Prouvé en prod (run à 0 KPI) |
| Tous parcours UI/UX (2 rôles × états) tiennent sur mobile | ✅ | États couverts ; faiblesse = fil coach, pas les états |

---

## Recommandations priorisées (impact × effort) — max 7

> Priorisation par **impact sur la fiabilité de la mesure d'abord** (le mandat),
> puis fluidité. Effort = ordre de grandeur indicatif.

1. **Rubrique 0-3 explicite + note précédente pour la mobilité/mouvement**
   *(impact 🔴 très élevé · effort moyen)* — Dans `assessmentScores.ts`, ajouter
   par axe un **descripteur observable de chaque niveau 0/1/2/3** (idéalement
   repère chiffré : doigts-mur en cm, profondeur de squat, angle), et afficher la
   **note du bilan précédent** à côté de chaque `ScaleField`. C'est le **plus gros
   gain de répétabilité pour un effort contenu** (données déjà historisées en base).
   Étape 2 (effort + élevé) : **une photo de référence par niveau**.

2. **Câbler les démos KPI existantes**
   *(impact 🟠 élevé · effort faible)* — Renseigner `KPI_PROTOCOLS[*].gifUrl`
   (au moins `broad_jump`→id 21, `weighted_pullup`→id 13, `medball`→id 9 qui ont
   déjà un GIF en base), **ou** faire lire à `KpiGifPanel` la colonne
   `dim_exercices.illustration_gif` (comme le promet déjà son commentaire). Garder
   le SVG en fallback. Améliore la standardisation du geste mesuré.

3. **Fil conducteur coach + intégrer l'étape KPI**
   *(impact 🟠 élevé · effort faible-moyen)* — Sur `StrengthAssessmentScreen`,
   afficher l'**état d'avancement** (questionnaire ✓/✗ · KPI ✓/✗ · physique ✓/✗
   pour le nageur sélectionné) et ajouter un bouton **« Mesurer les KPIs »** →
   `/strength/kpi-wizard` **avec la cible pré-sélectionnée** (passer `athleteId`).
   Corrige F1, F4, F5 d'un coup.

4. **Corriger le done-state questionnaire coach (F2/F3)**
   *(impact 🟠 moyen · effort faible)* — En `isCoachMode`, adapter le texte
   (« Questionnaire enregistré ») et offrir **« Noter le bilan physique
   maintenant »** → retour `/coach/strength-assessment` (nageur déjà ciblé), au
   lieu de « Retour à la muscu » → fiche nageur.

5. **BUG-1 — autoriser 0 et charges assistées sur `weighted_pullup`**
   *(impact 🟠 moyen · effort faible)* — Pour ce KPI, permettre `−` et `0` dans
   l'input (assoupir le regex `updateAttempt` et `parseAttempts` au cas
   `weighted_pullup`, ou champ dédié « assistance / lest »). Sinon la médiane
   filles/débutants est non mesurable et le seau force-haut tombe à `null`.

6. **Fiabiliser la détente verticale**
   *(impact 🟠 moyen · effort moyen)* — A minima : **moyenner** les 3 temps de vol
   au lieu de `Math.max` (retire le biais haut), et afficher l'écart-type pour
   signaler une mesure douteuse. Idéal : support **vidéo slow-mo** (saisie de la
   hauteur mesurée directement) ou tapis de contact. Marquer le KPI « estimation »
   tant que le chrono manuel est la seule source.

7. **Confiance barème par-KPI et au moment de la mesure**
   *(impact 🟡 · effort faible)* — Afficher le flag (`transposed`/`placeholder`)
   **par KPI** dans le recap wizard, traduit (« barème non calibré natation —
   score indicatif »), pas seulement le minimum agrégé en enum brut à l'aperçu.

---

## Annexes

### A. Sorties tsc / test / build

```
$ npx tsc --noEmit                       → exit 0
$ npm test                               → tests 935 / pass 935 / fail 0  (~39,2 s)
$ npm run build                          → ✓ built in 28.20s · PWA precache 273 entries (~4,07 MiB)
```
(935 tests vs 901 à l'audit du 2026-05-23 → +34, cohérent avec les ajouts §300.)

### B. Requêtes SQL prod (`fscnobivsgornxdwqwlk`) + résultats clés

```sql
-- 5.3 assessments par athlète : historisé ou écrasé ?
SELECT athlete_id, COUNT(*) n, COUNT(*) FILTER (WHERE physical_tests IS NOT NULL) coach_noted
  FROM strength_assessments GROUP BY athlete_id;
-- → athlete_id=1 : 2 assessments, 1 coach_noted  ⇒ nouvelle ligne par bilan (historisé),
--    mais l'écran de notation ne montre pas la précédente.

-- 5.4 re-mesures KPI observables ?
SELECT athlete_id, kpi_key, COUNT(*) FROM strength_kpi_measurements GROUP BY 1,2;
-- → [] : strength_kpi_measurements est VIDE. Aucun KPI jamais persisté en prod.

-- détail assessments
-- → 7bac… athlete 1, coach 3, completed, q✓ phys✓, scored=false, data_confidence='full' (défaut)
-- → ed23… athlete 1, coach=NULL, bilan_pending, q✓ phys✗ (auto-démarré §299), data_confidence='full'

-- mésocycle + raisonnement
-- → 0d1a… athlete 1, active, sprint_50/inter_competition, 5 sem, généré par role=athlete,
--    dataConfidence='low', bucketScores={mobility:100, psychology:66.7, lower/upper *:null}
--    ⇒ généré avec 0 KPI ; le moteur encaisse les données partielles sans bloquer.

-- 5.5 cohérence templates : min=Σmin ET max=Σmax ?
-- → 14/14 OK (sprint_50 season 8-16 Σmax=16 ⇒ Finding B §293 clos par §294)

-- 5.6/5.6b pain_reports
-- → policies : pain_own (ALL), pain_coach_read (SELECT), pain_coach_write (ALL)
--    pain_coach_write USING/CHECK = app_user_role() IN ('coach','admin')  ✅ (pas auth.uid)

-- 5.7 profils incomplets (sex/birthdate)
-- → 4/15 incomplets, TOUS coachs (0 athlète) ⇒ aucun nageur réel bloqué par les barèmes.

-- is_core par bucket (Finding A §293)
-- → upper_strength : 7 cores / 37 (étaient 14) ; les 7 = piliers + Tractions élastiques (débutant). Clos.

-- 5.2 GIFs des mouvements KPI dans dim_exercices
-- → "Saut en longueur"(21)✓, "Tractions lestées"(13)✓, "Lancer de médecine-ball"(9)✓ ont un GIF…
--    …mais le wizard lit protocol.gifUrl (null), PAS dim_exercices.illustration_gif → SVG affiché.
```

### C. Fichiers-preuves (chemin:ligne)

| Constat | Preuve |
|---|---|
| 5 protocoles `gifUrl: null` | `kpiProtocols.ts:38,52,70,85,99` |
| GIF panel lit le champ statique, pas la DB | `KpiGifPanel.tsx:25-37` (vs commentaire `:10`) |
| Barèmes 1 solid / 3 transposed / 1 placeholder | `kpiBaremes.ts:90,122,154,186,218` |
| Confiance barème affichée à l'aperçu (agrégée, enum) | `MesocyclePreview.tsx:634-640` |
| Recap KPI = valeur+delta, pas de score/confiance | `KpiRecap.tsx:158-209` |
| Détente : `Math.max` des temps de vol (biais haut) | `jumpPower.ts:94` ; `VerticalJumpInputs.tsx:56` |
| Chrono `performance.now()` (réaction humaine non atténuée) | `KpiStopwatch.tsx:63,77` |
| BUG-1 : `−` strippé + `≤0` rejeté vs ancres ≤ 0 | `KpiWizard.tsx:208` ; `kpiMeasurement.ts:23` ; `kpiBaremes.ts:189,203` |
| Mobilité : libellés extrêmes seuls, niveaux 1/2 indéfinis | `assessmentScores.ts:34-95` ; `StrengthAssessmentScreen.tsx:649-666` |
| Pas de comparaison mobilité dans le temps | `StrengthAssessmentScreen.tsx:689-692` (contexte = questionnaire+kpis) |
| F1 entrée coach unique « Bilan muscu » | `Coach.tsx:466` ; tuiles KPI seulement `Strength.tsx:1076` |
| F2/F3 done-state questionnaire coach = texte nageur + retour fiche | `StrengthQuestionnaire.tsx:153-154,265-285` |
| F4 cible re-sélectionnée par écran | `KpiWizard.tsx:113-117` ; `StrengthAssessmentScreen.tsx:161` ; `MesocycleGeneration.tsx:151-155` |
| §299 autonomie : StartBilanEntry / gating | `StrengthBilanEntry.tsx:113-184` ; `mesocycleGating.ts:20-22` |
| §299 questionnaire/génération coach (cible OK) | `StrengthQuestionnaire.tsx:91-96` ; `MesocycleGeneration.tsx:151-156` ; `StrengthAssessmentScreen.tsx:479,588` |
| §300 revert cohérent (pas de raw_payload:null) | `mesocycleItemPayload.ts:40-52` ; `MyPlanSessionSheet.tsx:82` |
| États preview robustes | `MesocyclePreview.tsx:158,223,367,392,624-631` |

### D. Findings antérieurs vérifiés CLOS (non re-signalés)

| Finding | Source | État vérifié cette session |
|---|---|---|
| Autonomie nageur bloquée (2 verrous coach) | audit 2026-05-23 | ✅ Clos §299 (`StartBilanEntry`, `canGenerateMesocycle`, prod : bilan auto-démarré) |
| Questionnaire & génération non pilotables coach | audit 2026-05-23 | ✅ Clos §299 (routes `:athleteId`, cible propagée) |
| Édition séance générée impossible / `raw_payload:null` écrase | audit 2026-05-23 | ✅ Clos §300 (`reconcileMesocyclePayloads`, deeplink « Éditer la séance ») |
| `is_core` upper_strength pollué par le gainage (Finding A) | audit §293 | ✅ Clos §294 (14→7 cores, gainage sorti, pilier débutant ajouté) |
| Σmax=17 ≠ max_week_count=16 sprint_50 (Finding B) | audit §293 | ✅ Clos §294 (8-16, Σmax=16 ; 14/14 templates cohérents) |
| 1 nageur actif au profil incomplet | audit §293 | ✅ Résorbé (0 athlète incomplet ; les 4 restants sont des coachs) |

---

*Audit clos le 2026-05-23 — aucune modification de code. Conclusion : le **moteur
et la persistance sont robustes** (prouvé jusqu'au cas extrême « 0 KPI ») et les
blocages de parcours des audits précédents sont **bien fermés** (§294/§299/§300).
Le travail restant porte sur le **cœur du mandat** : rendre la **mesure
fiable et répétable** — d'abord la **mobilité/amplitudes** (rubrique 0-3 +
référence + comparaison temporelle), puis la **détente verticale** (biais chrono)
et les **démos** — et **souder la séance coach en un parcours guidé** (intégrer le
KPI, fermer le cul-de-sac questionnaire→notation, partager la cible). Les
recommandations 1-4 (effort faible-moyen) suffisent à franchir l'essentiel de
l'écart.*
