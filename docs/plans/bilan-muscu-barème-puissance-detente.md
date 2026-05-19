# Bilan Muscu — Barème de puissance « détente verticale » (sources & proposition)

## Validation coach — 2026-05-19

**Statut : VALIDÉ — barème à encoder selon l'Option A.**

Décisions arrêtées (cf. §8) :

1. **Détente scorée en W/kg** — **Option A** retenue (§5). Le confond « masse
   corporelle » du score en W absolus est écarté. `value` = W/kg.
2. Équation de Sayers **squat jump** (`60,7·h + 45,3·m − 2055`) conservée, comme
   fixée par le design.
3. Barème livré en confiance **`transposed`** ; campagne de calibration club
   recommandée avant passage en `solid`.

Tasks 1.2/1.4/1.5 sont exécutées sur cette base (cf. §7, colonne Option A).

---

**Statut initial : PROPOSITION — à relire et valider par le coach avant encodage.**
Tâche 1.1 du Chantier C+D (§293). Ce document NE modifie aucun code : il est le
point de validation préalable à l'encodage du barème dans
`src/lib/strength/kpiBaremes.ts` (Task 1.4).

> Décision de cadrage déjà validée (design §2, ne pas re-litiger) : le KPI
> `vertical_jump` devient une **mesure de puissance** — poids saisi + 3 sauts
> stricts, temps de vol chronométré → hauteur → puissance (Sayers). Ce document
> ne rediscute pas *ça* ; il instruit **comment scorer** cette puissance.

---

## 1. Objet

Le KPI `vertical_jump` passe d'une mesure de **hauteur** (cm) à une mesure de
**puissance**. Il faut donc remplacer le barème actuel (ancres en cm, §290,
flaggé `transposed`) par un barème de puissance, par **sexe** et **bande d'âge**
(13-14 / 15-16 / 17-18 — alignées sur `kpiBaremes.ts`).

Ce document : (a) source les normes de puissance du saut vertical chez les
jeunes ; (b) pose **une question de conception** que la recherche a fait
remonter — scorer en **watts absolus** ou en **watts par kg** ; (c) propose le
barème chiffré pour les deux options ; (d) recommande.

---

## 2. Le test et le calcul

**Protocole** (détaillé en Task 1.3) : le nageur saisit son **poids**. 3 sauts
stricts — flexion puis saut **jambes tendues, sans tuck** (un tuck fausserait le
temps de vol). Un binôme chronomètre le **temps de vol** `t` de chaque essai.
Meilleur des 3 retenu.

**Hauteur à partir du temps de vol.** Le corps monte pendant `t/2` puis
redescend pendant `t/2` ; la hauteur du centre de masse est :

```
h = g · t² / 8        (g = 9,81 m/s²)
```

Exemple : `t = 0,50 s` → `h = 9,81 · 0,25 / 8 = 0,3066 m ≈ 30,7 cm`.

**Puissance — équation de Sayers.** Le design fixe l'équation de Sayers (1999),
*peak power* :

```
P (W) = 60,7 · h(cm) + 45,3 · m(kg) − 2055
```

Exemple : `h = 40 cm`, `m = 70 kg` → `P = 2428 + 3171 − 2055 = 3544 W`.

> **Note technique (mineure, non bloquante).** Sayers a publié *deux* équations :
> celle ci-dessus pour le **squat jump** (départ statique), et une variante pour
> le **countermovement jump** : `P = 51,9·h + 48,9·m − 2007`. Le protocole retenu
> (flexion *puis* saut) est techniquement un countermovement jump. L'écart entre
> les deux formules est un **décalage quasi-uniforme** (~3-6 % aux valeurs
> jeunes) — sans effet sur le *classement* des nageurs. Le design et le plan
> (Task 1.2) fixent la formule squat jump : **je la conserve**. À signaler au
> coach pour information ; une calibration club (cf. §6) absorberait de toute
> façon ce décalage.

---

## 3. Sources

### 3.1 Source principale — puissance CMJ des jeunes (SOLIDE)

**Rodrigues et al. (2024)**, *Reference values for the countermovement jump in
pediatric populations*, Frontiers in Pediatrics (PMC10850334). 736 jeunes
portugais (377 garçons, 359 filles), saut contre-mouvement mesuré sur
plateforme **Leonardo Mechanograph**, **puissance relative en W/kg**, percentiles
publiés (p3…p97) **par âge (10-18 ans) et par sexe**.

C'est la meilleure source disponible : bonne population (jeunes, des deux sexes,
toute la plage d'âge du Bilan), métrique de puissance, **percentiles directs**.
Elle publie la puissance en **W/kg** — c'est le point central de la §4.

**Puissance relative (W/kg) — extrait, percentiles, par âge :**

| | p10 | p25 | p50 | p75 | p90 |
|---|---|---|---|---|---|
| Garçons 13 ans | 35,2 | 38,5 | 42,5 | 47,2 | 52,9 |
| Garçons 14 ans | 38,6 | 42,4 | 46,8 | 51,8 | 57,7 |
| Garçons 15 ans | 41,3 | 45,4 | 50,1 | 55,4 | 61,4 |
| Garçons 16 ans | 43,1 | 47,3 | 52,1 | 57,5 | 63,6 |
| Garçons 17 ans | 45,0 | 49,4 | 54,3 | 59,8 | 66,1 |
| Garçons 18 ans | 47,6 | 52,1 | 57,1 | 62,9 | 69,5 |
| Filles 13 ans | 33,4 | 36,0 | 39,3 | 43,0 | 46,8 |
| Filles 14 ans | 33,7 | 36,4 | 39,8 | 43,5 | 47,4 |
| Filles 15 ans | 34,0 | 36,8 | 40,3 | 44,1 | 48,0 |
| Filles 16 ans | 34,2 | 37,1 | 40,7 | 44,6 | 48,5 |
| Filles 17 ans | 34,3 | 37,4 | 41,1 | 45,2 | 49,2 |
| Filles 18 ans | 35,8 | 39,6 | 44,0 | 48,7 | 53,3 |

Deux faits que ces données confirment et qu'un barème doit respecter :
- **Garçons : forte progression** avec l'âge (p50 42,5 → 57,1 W/kg).
- **Filles : quasi-plateau** (p50 39,3 → 44,0 W/kg) — le même effet déjà observé
  sur `broad_jump` au §290.

### 3.2 Normes de puissance **absolue** (W) — rares et dépendantes de la méthode

La même étude donne une puissance absolue moyenne : garçons ~2189 W (13 ans) →
~3733 W (18 ans), filles ~1996 → ~2437 W. Mais ces valeurs sont mesurées sur
plateforme de force ; l'équation de Sayers **surestime** la puissance des jeunes
(elle a été validée sur des adultes de ~21 ans). Une puissance « Sayers » et une
puissance « plateforme » ne sont **pas sur la même échelle** — d'où la §6.

### 3.3 Rappel — barème `vertical_jump` actuel (§290)

Le barème en place (`kpiBaremes.ts`) est en **cm**, flaggé `transposed`, et
adossé à un protocole *jump-and-reach* (scotch au mur). Le Chantier C+D le
remplace intégralement : nouveau protocole (temps de vol) **et** nouvelle
grandeur (puissance). Les ancres cm ne sont pas réutilisables telles quelles.

---

## 4. ⚠️ Décision principale à valider — scorer en W absolu ou en W/kg ?

L'équation de Sayers produit une puissance **absolue** (W). Le plan d'origine
prévoit un barème en **W absolus**. **La recherche fait remonter un problème.**

La puissance absolue mélange deux choses : « être puissant » et « être lourd ».
Deux nageurs au **même temps de vol** (donc même hauteur, même qualité de saut)
mais de poids différents obtiennent une puissance absolue différente — le plus
lourd marque plus haut. Conséquences si le barème est en W absolus :

- Un nageur **lourd mais moyen** est sur-scoré sur le seau « puissance bas du
  corps » → ce seau est jugé « plein » → **moins de travail de puissance
  programmé** alors qu'il en aurait besoin.
- Un nageur **léger mais explosif** est sous-scoré → sur-priorisé à tort.

Le moteur `mesocycleEngine` se sert précisément du score de seau pour
**prioriser** (Task 2.2). Un score confondu par la masse **fausse la
priorisation** — ce n'est pas cosmétique.

`broad_jump`, l'autre KPI du même seau, ne souffre pas de ça (une distance n'est
pas mécaniquement liée au poids de la même façon).

**À l'inverse, le score en W/kg (puissance relative) :**
- est **équitable** quelle que soit la corpulence ;
- est ce que la littérature jeunes publie (Frontiers 2024 ⇒ barème **issu de
  vraies données**, pas transposé) ;
- est le plus **pertinent pour la natation** : pousser au mur ou en plongeon,
  c'est accélérer **sa propre masse** → la puissance *par kg* prédit mieux la
  vitesse de poussée.

> **Recommandation : scorer la détente verticale en W/kg.** Le wizard capte
> toujours poids + temps de vol et calcule la puissance Sayers ; on **divise par
> le poids** pour obtenir la W/kg, et c'est cette valeur qui est scorée et
> stockée (`value` = W/kg, `unit` = `W/kg` ; la puissance absolue, la hauteur et
> les 3 temps de vol restent dans `attempts`).
>
> Cela reste « une mesure de puissance par Sayers » — la décision de cadrage est
> respectée ; on ne fait que **normaliser** par la masse, ce qui est d'ailleurs
> la façon standard dont les normes jeunes sont exprimées.
>
> **C'est un écart au plan** (Task 1.2/1.4/1.5 disent « W »). Il demande l'accord
> du coach **et** du porteur du plan. Le §7 chiffre l'impact (faible).

---

## 5. Barème proposé

### Schéma d'ancrage

Inchangé vs §290 : 5 ancres `[valeur, score]`, percentiles → scores
`p10→10, p30→30, p50→50, p70→70, p90→90`. Frontiers publie p10/p25/p50/p75/p90 ;
p30 et p70 sont interpolés linéairement sur l'axe des percentiles. Agrégation
des deux âges d'une bande = moyenne arithmétique.

### Option A — barème en **W/kg** *(recommandée)*

Issu directement des percentiles Frontiers 2024 (§3.1).

**Garçons — puissance détente (W/kg)**

| Bande | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| 13-14 | 36,9 | 41,3 | 44,7 | 48,5 | 55,3 |
| 15-16 | 42,2 | 47,3 | 51,1 | 55,4 | 62,5 |
| 17-18 | 46,3 | 51,7 | 55,7 | 60,2 | 67,8 |

**Filles — puissance détente (W/kg)**

| Bande | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| 13-14 | 33,6 | 36,9 | 39,6 | 42,5 | 47,1 |
| 15-16 | 34,1 | 37,7 | 40,5 | 43,6 | 48,3 |
| 17-18 | 35,1 | 39,3 | 42,6 | 46,1 | 51,3 |

### Option B — barème en **W absolus** *(plan d'origine)*

Faute de table de percentiles de puissance absolue jeunes sur l'échelle Sayers,
ce barème est **dérivé** : ancres de hauteur §290 (cm) passées dans l'équation
de Sayers avec un **poids de référence par bande** (poids de référence repris du
§290 § 6, déjà acceptés par le coach : G 52/65/72 kg, F 50/56/60 kg).

**Garçons — puissance détente (W)**

| Bande | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| 13-14 | 2000 | 2425 | 2790 | 3155 | 3580 |
| 15-16 | 2890 | 3380 | 3805 | 4165 | 4590 |
| 17-18 | 3450 | 3940 | 4365 | 4790 | 5275 |

**Filles — puissance détente (W)**

| Bande | p10→10 | p30→30 | p50→50 | p70→70 | p90→90 |
|---|---|---|---|---|---|
| 13-14 | 1485 | 1790 | 2090 | 2395 | 2820 |
| 15-16 | 1880 | 2240 | 2545 | 2850 | 3275 |
| 17-18 | 2180 | 2545 | 2850 | 3210 | 3635 |

> Option B hérite du confond « masse corporelle » décrit en §4, **et** part de
> hauteurs §290 elles-mêmes `transposed`. C'est l'option la moins solide ; elle
> n'est listée que parce que c'est celle du plan d'origine.

---

## 6. Flag de confiance & calibration club

**Confiance proposée : `transposed`** (quelle que soit l'option A ou B).

- La **forme** du barème (écart garçons/filles, progression par âge, plateau
  filles) est **solidement** sourcée (Frontiers 2024, 736 jeunes).
- Mais le **niveau absolu** n'est pas validé sur *notre* chaîne de mesure :
  Frontiers mesure sur plateforme de force, l'app calcule via temps de vol +
  Sayers. Sayers surestimant la puissance des jeunes, les nageurs scoreront en
  moyenne **au-dessus de 50** tant qu'aucune calibration n'a eu lieu.
- C'est exactement la **question ouverte n°3 du §290** (« calibrer
  `vertical_jump` sur le club »), toujours valable.

**Recommandation** : mesurer 10-20 nageurs EAC avec la chaîne réelle de l'app
(temps de vol → Sayers), comparer à ce barème, recaler si besoin, et **alors
seulement** passer le flag à `solid`. Tant que la calibration n'a pas eu lieu :
`transposed`.

---

## 7. Impact sur le plan selon l'option retenue

| | Option A (W/kg) — recommandée | Option B (W absolus) — plan d'origine |
|---|---|---|
| Task 1.2 `jumpPower.ts` | `sayersPeakPower` **inchangée** + ajouter `relativePower(p, kg) = p/kg` | inchangée |
| Task 1.4 `kpiBaremes.ts` | ancres = table Option A, `unit` implicite W/kg | ancres = table Option B |
| Task 1.5 wizard / stockage | `value` = W/kg, `unit` = `W/kg` ; `attempts` = `{ weight_kg, flight_times, peak_power_w, height_cm }` | `value` = W, `unit` = `W` |
| `mesocycleEngine.scoreBuckets` | score lu directement | idem |
| Confiance | `transposed` (→ `solid` après calibration) | `transposed` |

L'écart de charge entre les deux options est **mineur** (une fonction d'une
ligne + le libellé d'unité). Aucun impact sur les Phases 2-7.

---

## 8. Décisions demandées au coach

1. **(Principale)** Scorer la détente en **W/kg** (Option A, recommandée) ou en
   **W absolus** (Option B, plan d'origine) ? — cf. §4.
2. **(Mineure, pour information)** L'équation de Sayens « squat jump »
   (`60,7·h + 45,3·m − 2055`) est conservée comme fixée par le design, bien que
   le protocole soit un countermovement jump. OK ? — cf. §2.
3. **(Confirmation)** Le barème est livré en confiance `transposed`, avec une
   campagne de calibration club recommandée avant passage en `solid`. OK ? —
   cf. §6.

Une fois ces points tranchés, l'encodage (Task 1.4) et le wizard (Task 1.5)
peuvent être réalisés sans nouvelle validation.

---

## Sources

- Rodrigues et al. (2024), *Reference values for the countermovement jump in
  pediatric populations*, Frontiers in Pediatrics —
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC10850334/>
- Sayers SP. et al. (1999), *Cross-validation of three jump power equations*,
  Med. Sci. Sports Exerc. (équations *peak power* squat jump / CMJ).
- Estimation of Peak Muscle Power From a Countermovement Vertical Jump in
  Children and Adolescents (2019), J. Strength Cond. Res. —
  <https://pubmed.ncbi.nlm.nih.gov/28570492/>
- `docs/plans/bilan-muscu-baremes-sources.md` — barèmes KPI §290 (poids de
  référence, question ouverte n°3 sur la calibration `vertical_jump`).
</content>
</invoke>
