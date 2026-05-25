# Conception §305 — Taxonomie nage × distance (générateur de mésocycle)

*Date : 2026-05-25. Conception validée en brainstorming.*
*Suite de §304 (`docs/plans/2026-05-25-muscu-304-couplage-niveau-tier-design.md`).*
*Corrige le défaut de fond identifié pendant l'audit 100 m H : `event_group` est
un axe plat qui mélange distance et nage.*

## 1. Problème

La taxonomie `event_group` (`strength_periodization_templates`, seed `00169`)
mélange **distance et nage sur un seul axe** :

| `event_group` actuel | Nature réelle | Conséquence |
|---|---|---|
| `sprint_50`, `200m`, `400m`, `distance` | des **distances** (crawl implicite) | pas de **100 m** explicite ; nage non choisie |
| `backstroke`, `breaststroke` | des **nages** (sans distance) | un **50 dos** et un **200 dos** = même template |
| `medley` | catégorie | ok |
| *(papillon)* | **absent** | aucun template fly |

Impossible aujourd'hui d'exprimer « 100 crawl », « 50 dos » ou « 200 papillon ».
Or les études confirment des différences dryland **notables par nage**
(crawl/fly ≈ tirage bilatéral ; dos = chaîne postérieure + épaule ; brasse =
hanche/adducteurs, risque inguinal) — tandis que la **distance** pilote surtout
l'arc de périodisation et la balance puissance↔endurance. La divergence 50 vs 100
est réelle mais **essentiellement aquatique** (hausse ~50 % de la demande aérobie
au 100) ; côté salle elle est marginale. (Audit
`docs/audits/2026-05-25-audit-muscu-100nl-hommes-elite-vs-generateur.md`, §4 + §
brainstorming.)

## 2. Objectifs / Non-objectifs

**Objectifs :**
- Choisir **la nage PUIS l'épreuve (distance)**, et composer le plan en
  conséquence.
- Couvrir les **5 nages** (crawl, papillon, dos, brasse, 4 nages) — papillon
  inclus — et les distances **50 / 100 / 200 / 400+**.
- Ne **pas** régresser les emphases déjà validées par le coach.

**Non-objectifs (→ §306 / autres) :**
- **Préhab ciblée par nage** (adducteurs brasse vs épaule crawl/fly/dos) :
  nécessite un tag de région sur les exercices + sélection mobilité région-aware
  → **§306**. §305 reste **emphasis-driven**.
- Couplage macrocycle natation / transfert eau (hors périmètre produit
  2026-05-24).
- Autorégulation/VBT, deload, bloc force ≥ 90 % (écarts GB-GH, futurs §).

## 3. Décisions arrêtées (brainstorming)

1. **Modèle A** — deux tables DB composables (pas d'explosion de combos, pas de
   config-en-code).
2. **Distances (i)** — 50 / 100 / 200 / 400+ exposées ; **100 = arc sprint avec un
   pic moins dépouillé + un peu plus de `force_max` retenu** (seule nuance 50↔100
   défendable).
3. **Nages (i)** — spécificité **portée par `bucket_emphasis`** (pas de nouveau
   tag d'exercice en §305).

## 4. Modèle de données

### 4.1 `strength_stroke_signatures` (nouvelle)

Le **patron musculaire** d'une nage (distance-neutre).

| Colonne | Type | Rôle |
|---|---|---|
| `stroke_key` | TEXT PK | `freestyle` \| `butterfly` \| `backstroke` \| `breaststroke` \| `medley` |
| `label` | TEXT | libellé FR (Crawl, Papillon, Dos, Brasse, 4 nages) |
| `mult` | JSONB | **multiplicateur par seau vs crawl** (les 5 seaux : `lower_strength`, `lower_power`, `upper_strength`, `upper_power`, `mobility`). **Crawl ≡ tous à 1.0.** Calibré à la distance de référence 200 m : `mult[b] = emphase_nage[b] / crawl_200[b]`. |

**Papillon = nouveau** : dérivé du crawl (tirage bilatéral, upper dominant) +
plus de chaîne postérieure/gainage (ondulation), charge d'épaule la plus haute.

### 4.2 `strength_distance_profiles` (nouvelle)

L'**arc de périodisation** + la **modulation par distance**.

| Colonne | Type | Rôle |
|---|---|---|
| `distance_key` | TEXT | `50` \| `100` \| `200` \| `400plus` |
| `kind` | TEXT | `season` \| `inter_competition` |
| `label` | TEXT | libellé FR |
| `structure` | JSONB | `phases[]` (cycle / min / nominal / max weeks) — comme `template.structure` aujourd'hui |
| `min_week_count`, `max_week_count` | INT | bornes |
| `emphasis` | JSONB | **emphase canonique par seau** (les 5 seaux), **ancrée sur le crawl** (nage de référence — seule nage avec 4 distances ground-truth). Reproduit exactement les templates crawl 50/200/400/distance. |

PK `(distance_key, kind)`.

### 4.3 `strength_mesocycles` (existante — ALTER)

- Ajouter `stroke TEXT NULL`, `distance TEXT NULL`.
- Rendre `template_id` **nullable** (nouvelles générations : `NULL`).
- `event_group` conserve une **clé composée** lisible (ex. `freestyle_100`) pour
  l'affichage/historique. Anciennes lignes inchangées.

## 5. Règle de composition (le cœur)

À la génération, on compose un objet **« template-like » identique à celui que le
moteur consomme déjà** — donc `mesocycleEngine.ts` est **inchangé** :

```
composed.structure          = distance_profile.structure
composed.min/max_week_count = distance_profile.min/max_week_count
composed.kind               = kind
composed.name               = `${stroke.label} ${distanceLabel}` (+ kind)
composed.event_group        = `${stroke_key}_${distance_key}`   // clé composée
composed.bucket_emphasis[b] = clamp01( round2(
                                 distance_profile.emphasis[b]    // ancré crawl
                                 × stroke.mult[b] ) )            // crawl ≡ 1.0
```

**Pourquoi `emphasis(distance) × mult(nage)` par seau** (et pas un
multiplicateur par *catégorie*) : dans les données réelles, le ratio
`lower_power/upper_power` du crawl **s'inverse** selon la distance (1,80 au 50 m,
~0,9 au 200/400/fond — le sprinteur privilégie le bas, le fondeur le haut). Un
multiplicateur unique de catégorie « power » ne peut pas reproduire ce
basculement. En portant l'**emphase par seau sur la distance** (ancrée crawl) et
un **multiplicateur par seau sur la nage**, on capture le basculement et on reste
expressif.

**Garde anti-régression (par construction, pas une tolérance floue) :**
- Crawl (`mult` ≡ 1.0) → `bucket_emphasis = distance_profile.emphasis` →
  **reproduit exactement** les 4 templates crawl 50/200/400/distance.
- Brasse / dos / 4 nages → `mult[b] = emphase_actuelle[b] / crawl_200[b]` →
  **reproduit exactement** leur emphase à la **distance de référence 200 m**, et
  extrapole proprement aux autres distances (clampé [0,1]).
- Les tests verrouillent ces 7 égalités (≈ exactes, ± arrondi `round2`).

> Référence des valeurs actuelles (extrait, `bucket_emphasis` seedés) :
> crawl sprint_50 `{mob .3, lp .9, up .5, ls .85, us 1.0}` ; crawl distance
> `{mob 1.0, lp .4, up .45, ls .75, us 1.0}` ; brasse `{mob .8, lp 1.0, up .6,
> ls .85, us .55}` ; dos `{mob .8, lp .7, up .9, ls .6, us .85}` ; 4 nages
> `{mob .8, lp .8, up .8, ls .75, us .85}`. On observe que **us (crawl) reste
> ~0,9-1,0 quelle que soit la distance** (patron nage) tandis que **mobility
> monte 0,3→1,0 et power descend avec la distance** (modulation distance) — ce qui
> valide le modèle base × multiplicateur.

## 6. Nages × distances offertes

- 5 nages × **{50, 100, 200}** pour toutes ; **400+** pour `freestyle` / `medley`
  uniquement (cohérent avec le calendrier réel des épreuves).
- `100` : arc = sprint avec **pic moins dépouillé** et **un peu plus de `force_max`
  retenu** (multiplicateurs/arc dédiés, distincts du 50).
- `kind` (season / inter_competition) **orthogonal**, inchangé.

## 7. UI — `MesocycleGeneration.tsx`

Remplacer le chip-picker unique `event_group` par **deux étapes** :
1. **Nage** (5 choix).
2. **Épreuve / distance** — choix filtrés selon la nage (50/100/200 ; +400+ pour
   crawl/4 nages).

Puis les étapes existantes **`kind` → semaines → séances/sem** inchangées. Même
hand-off sessionStorage ; l'aperçu (`MesocyclePreview.tsx`) compose l'objet
template-like via la nouvelle fonction de composition.

## 8. Migration & rétro-compatibilité

- Nouvelles tables **seedées** (décomposées des 14 templates actuels + papillon +
  profils 100).
- **Conserver `strength_periodization_templates` et ses lignes** : les
  `strength_mesocycles.template_id` historiques restent valides. Les nouvelles
  générations posent `template_id = NULL` et renseignent `stroke`/`distance`.
- Mettre à jour le RPC `apply_strength_mesocycle` pour accepter `stroke`/`distance`
  (et `template_id` optionnel). Les plans appliqués étant des **snapshots**
  (`strength_sessions` / `strength_session_items`), l'historique est **intact**.
- Toutes les migrations via **MCP Supabase** (projet `fscnobivsgornxdwqwlk`),
  fichiers `00193+`.

## 9. Tests

- **Fonction de composition pure** unit-testée, incluant les **assertions de
  non-régression à ± 0,1** vs les 7 valeurs seedées actuelles.
- Tests moteur **inchangés** (il reçoit toujours un objet template-like).
- **RLS** : les deux nouvelles tables sont des **données de référence en lecture
  seule** (comme `strength_periodization_templates`) → policies de lecture
  calquées dessus. Le changement de RPC ne modifie pas l'autorisation → `test:rls`
  **léger** uniquement si l'autorisation du RPC change (ne devrait pas).
- `npm test` (runner réel `node --test`) + `npx tsc --noEmit` verts.

## 10. Fichiers (prévisionnel)

| Fichier | Nature |
|---|---|
| `supabase/migrations/00193_strength_stroke_signatures.sql` | nouvelle table + seed + RLS lecture |
| `supabase/migrations/00194_strength_distance_profiles.sql` | nouvelle table + seed + RLS lecture |
| `supabase/migrations/00195_mesocycles_stroke_distance.sql` | ALTER `strength_mesocycles` + RPC `apply_strength_mesocycle` |
| `src/lib/strength/composeTemplate.ts` | fonction de composition pure (nage × distance → template-like) |
| `src/lib/strength/__tests__/composeTemplate.test.ts` | tests + garde de non-régression |
| `src/lib/api/strength-mesocycles.ts` | wrappers : fetch signatures/profiles, apply avec stroke/distance |
| `src/pages/MesocycleGeneration.tsx` | UI 2 étapes (nage → distance) |
| `src/pages/MesocyclePreview.tsx` | compose au lieu de fetch un template unique |
| `src/lib/api/types.ts`, `mesocycleEngine.types.ts` | types StrokeSignature / DistanceProfile / composed |
| docs (implementation-log/ROADMAP/FEATURES_STATUS/CLAUDE + files-map) | workflow obligatoire |

## 11. Risques & points d'attention

- **Calibration** : avec le modèle `emphasis(distance) × mult(nage)` par seau, les
  7 emphases existantes sont reproduites **exactement par construction** (crawl via
  `emphasis` ; brasse/dos/4 nages via `mult = emphase / crawl_200`). Pas de
  tolérance floue — les tests verrouillent les égalités. Restent à figer : le
  **mapping `400m` vs `distance`** (deux event_groups crawl aujourd'hui → un seul
  profil `400plus` : on retient les valeurs **`400m`**, épreuve réaliste ; le fond
  800/1500 rare s'y rattache — éviter de sur-tilter un 400 vers le pur fond), et le
  fait que l'emphase ne dépend pas de `kind` (season/inter) aujourd'hui (seul l'arc
  en dépend).
- **Papillon** : aucune valeur de référence existante → calibrage *de novo*
  (dérivé crawl + tilt postérieur/gainage), à valider par le coach.
- **RPC** : changer la signature de `apply_strength_mesocycle` doit rester
  rétro-compatible le temps du déploiement (params optionnels).

## 12. Références

- §304 design : `docs/plans/2026-05-25-muscu-304-couplage-niveau-tier-design.md`.
- Audit : `docs/audits/2026-05-25-audit-muscu-100nl-hommes-elite-vs-generateur.md`.
- Seed templates actuels : `supabase/migrations/00169_strength_periodization_templates_seed.sql`.
- Persistance mésocycle : `00170_strength_mesocycles.sql`, `00172_apply_strength_mesocycle.sql`.
