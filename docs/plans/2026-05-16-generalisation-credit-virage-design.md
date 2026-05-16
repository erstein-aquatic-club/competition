# Design — Généralisation du crédit-virage aux épreuves multi-virages (§282)

*Statut : validé — 2026-05-16. Suite de §281.*

## Contexte

§281 a remplacé, pour le **50 m**, la conversion bassin « ré-étirement au prorata » par un modèle crédit-virage : en bassin de 25 m la 1ʳᵉ longueur est verrouillée sur les passages grand bassin, et la majoration FFN est concentrée après le mur, rampée sur 13 m.

§281 était volontairement limité au 50 m. `turnCreditForShortCourse` portait un gate `D !== 50`. Les épreuves 100 m et plus en bassin de 25 m utilisent encore la conversion FFN ré-étirée — la dette explicitement notée dans `implementation-log.md` §281.

Ce chantier généralise le modèle à **toutes les épreuves disposant d'une majoration FFN** : 100/200 m (4 nages) + 400/800/1500 m (crawl).

## Décision — Approche A

`RATIOS_BASE[D]` reste le **profil grand bassin** (50 m), inchangé. Les vues 50 m ne bougent pas. Les vues 25 m valent `courbe canonique − Σ crédits des virages supplémentaires`.

Approches écartées :
- **B — recalibration complète** (refit des 6 courbes comme profils sans virage) : casse la conservation de cible, change tous les affichages 50 m, casse les tests `computeTMax` §12.x. Disproportionné.
- **C — tables 25 m dédiées par épreuve** : duplication de données, 6 courbes à calibrer à la main sans données. Le crédit dérivé de la majoration FFN produit déjà la dent de scie automatiquement.

## Conception

### 1. Moteur — `turnCreditForShortCourse` multi-mur

Un bassin de 25 m ajoute, par rapport à un bassin de 50 m, un mur tous les 50 m de course : aux positions 25, 75, 125 m… soit `D/50` murs supplémentaires. Chacun reçoit une part égale de la majoration FFN.

```ts
if (poolLengthM !== 25 || majoration_s <= 0) return 0;
const extraTurns = Math.round(D / 50);
const creditPerTurn = majoration_s / extraTurns;
let credit = 0;
for (let k = 0; k < extraTurns; k++) {
  const wall = 50 * k + 25;
  if (d > wall) credit += creditPerTurn * Math.min(1, (d - wall) / TURN_RAMP_M);
}
return credit;
```

- `D = 50` → `extraTurns = 1`, mur à 25 m, crédit = majoration → strictement identique à §281 (rétro-compatible).
- `D = 100` → 2 murs (25, 75), crédit `majoration/2` chacun. `D = 200` → 4 murs. `D = 1500` → 30 murs.
- À `d = D` : tous les murs franchis, rampes plafonnées → Σ = majoration → `t_SC(D) = t_LC(D) − majoration` = cible 25 m conservée.
- `TURN_RAMP_M = 13 m` reste uniforme. Une rampe par famille (le virage de fond a une reprise plus courte) est une calibration future, hors v1.

### 2. Câblage — `PaceMatrix.tsx` et `export-pace-pdf.ts`

Le gate passe de « épreuve = 50 m » à « majoration FFN définie » :
- `isSprintTurnModel` → `isTurnModelEvent = getPoolMajorationMs(...) !== null`.
- `sprintMajorationMs` → `turnMajorationMs`.
- Le reste du câblage §281 — `tMax = computeTMax(cible grand bassin) − turnCreditForShortCourse({ d, D, poolLengthM, majoration_s })` — est déjà générique en `D` et `poolLengthM`. Aucun autre changement.

Épreuves sans majoration FFN (400/800/1500 dos/brasse/pap) → `isTurnModelEvent = false` → comportement legacy actuel (toggle bassin désactivé). Inchangé.

### 3. Cas limites

- **Chevauchement de rampe** : murs espacés de 50 m, rampe 13 m → jamais de chevauchement, chaque ligne a une somme propre.
- **Monotonie** : le crédit croît avec `d` mais bien plus lentement que la courbe LC (incrément crédit ≤ ~0,35 s / 5 m vs incréments LC de plusieurs secondes) → matrice strictement croissante. Couvert par test.
- **4N** : hors scope — matrice segmentée séparée (`Pace4NSegmentMatrix`), ne convertit pas les bassins aujourd'hui. Intouché.
- **Vues 50 m** : `poolLengthM = 50` → crédit 0 → strictement inchangées.

### 4. Tests (TDD)

- **Test §281 à réécrire** : `"returns 0 for non-50 m events"` devient faux (D=100 renvoie désormais un crédit) — c'est le changement voulu ; remplacé par des assertions multi-mur.
- Nouveaux tests `turnCreditForShortCourse` : D=100 (murs 25/75, crédit plein à 100 m, demi-crédit entre les murs), D=200, monotonie sur une épreuve longue.
- Test d'intégration `PaceMatrix` : rendu 100 m bassin 25 m — 1ʳᵉ longueur verrouillée sur le grand bassin.
- `computeTMax` et `RATIOS_BASE` non touchés → tests §12.2/§12.3 intacts.

## Fichiers touchés

| Fichier | Nature |
|---------|--------|
| `src/lib/paceCalculatorV2.ts` | `turnCreditForShortCourse` multi-mur |
| `src/components/coach/pace/PaceMatrix.tsx` | Gate `isTurnModelEvent` |
| `src/lib/export-pace-pdf.ts` | Gate `isTurnModelEvent` |
| `src/__tests__/paceCalculatorV2.test.ts` | Tests multi-mur (1 réécrit + nouveaux) |
| `src/components/coach/pace/__tests__/PaceMatrix.test.tsx` | Test intégration 100 m 25 m |
| Docs | `implementation-log.md` §282, `ROADMAP.md`, `FEATURES_STATUS.md`, `CLAUDE.md`, `files-map.md`, `pace-calculator-scenarios.md` §6 |

## Hors scope / dette

- **Rampe `TURN_RAMP_M` uniforme** : 13 m pour toutes les familles. Une rampe plus courte pour le demi-fond/fond est une calibration future.
- **4N en bassin 25 m** : aucune conversion bassin aujourd'hui ; chantier séparé.
- **Provenance des courbes `RATIOS_BASE`** : supposées profils grand bassin. Si elles étaient un mélange moyenné 25/50 m, léger biais — pré-existant, non aggravé par ce chantier.
