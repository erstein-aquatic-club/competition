# Plan François WAGNER — Révision Trap Bar Jump (27 avril 2026)

> Addendum au document `plan complet coach et perso.docx`. Cette révision **remplace tous les Power Clean et Hang Clean** par du **Trap Bar Jump** sur les semaines S5-S9 (DB : S17-S22), suite à une douleur ressentie le vendredi 24 avril 2026 pendant un Power Clean.

## Contexte

- **Phase actuelle** : S5 (28 avril – 3 mai), Pic Puissance.
- **Incident** : douleur lors du Power Clean du vendredi 24/04 (S4, "Vendredi — Nerveux + Calisthenics"), toujours présente le 27/04.
- **Décision** : retrait définitif du clean (technique non maîtrisée → risque répété).
- **Substitut retenu** : **Trap Bar Jump** — meilleur compromis cohérent avec la méthode Cam McEvoy + référence Chris Hoy.

## Pourquoi Trap Bar Jump

| Critère | Power Clean | Trap Bar Jump |
|---|---|---|
| Triple extension explosive | ✅ | ✅ |
| Transfert départ plot | ✅ | ✅ |
| Charge accessible avec coût technique faible | ❌ | ✅ |
| Stress poignet / coude / épaule (zone douleur) | ÉLEVÉ | **NUL** (réception au sol, prise neutre) |
| Pattern moteur déjà connu | ❌ | ✅ (trap bar pilier S0-S3) |
| Cohérence McEvoy | partielle (issu de Chris Hoy) | **forte** (McEvoy travaille trap bar) |
| Référence sport-science | Bonne | **Égale ou supérieure** : Lake & Lauder, JSCR 2014 — puissance pic identique au PC, coût technique négligeable |

## Mise à jour BDD (effectuée le 2026-04-27)

- **Nouvel exercice** : `dim_exercices` id=90 — `Trap Bar Jump`, type `strength`, subtype `power`.
- **Sessions renommées** : `Mardi — Power Clean + Box Jumps` → `Mardi — Trap Bar Jump + Box Jumps` (S20) ; `Mardi — Power Clean + Gainage` → `Mardi — Trap Bar Jump + Gainage` (S21). Idem pour la copie de l'arborescence (parent_id=24).
- **Items migrés** : 12 au total (6 par arborescence × 2 dossiers François WAGNER).

## Détail S5 → S9

### S5 (28 avril – 3 mai) — Pic Puissance

| Jour | Session | Exercice modifié | Avant | **Après** |
|---|---|---|---|---|
| Lundi | Explosif Traction | Power Clean | 5×3 @ 75 % | **Trap Bar Jump 5×3 @ 40 %** (35-45 %) |
| Mardi | Explosif Jambes | — | inchangé | inchangé |
| Jeudi | Force-Vitesse | Hang Clean | 4×3 @ 75 % | **Trap Bar Jump 4×3 @ 50 %** (45-55 %, hauteur max) |
| Vendredi | Nerveux + Calisthenics | Power Clean léger | 3×2 @ 67 % | **Trap Bar Jump 3×3 @ 30 %** (25-35 %) |

### S6 (5-10 mai) — Idem S5, charges +5 % si vitesse maintenue.

### S7 (12-17 mai) — Taper -25 %

| Jour | Session | Avant | **Après** |
|---|---|---|---|
| Mardi | Trap Bar Jump + Box Jumps | Power Clean 3×3 @ 70 % | **Trap Bar Jump 3×3 @ 40 %** + Box Jumps 3×3 |

### S8 (19-24 mai) — Taper -50 %

| Jour | Session | Avant | **Après** |
|---|---|---|---|
| Mardi | Trap Bar Jump + Gainage | Power Clean 2×3 @ 65 % | **Trap Bar Jump 2×3 @ 35 %** + Ab Wheel 2×4 |

### S9 (25-31 mai) — Compétition

| Jour | Session | Avant | **Après** |
|---|---|---|---|
| Lundi | Activation | Power Clean ultra-léger 3×2 @ 60 % | **Trap Bar Jump 3×2 @ 28 %** + Box Jumps bas |

## Charges de référence (Trap Bar Jump)

Charge calculée sur le **1RM trap bar deadlift** (≈ 5RM × 1.15).

| Phase | % 1RM | Intention |
|---|---|---|
| S5-S6 | 35-50 % | Vitesse de barre MAX, décoller franchement |
| S7 | 40 % | Maintien nerveux, qualité absolue |
| S8 | 35 % | Volume -50 %, fraîcheur prioritaire |
| S9 | 25-30 % | Activation pure, sortir vite et haut |

## Consignes douleur (J0 = 27/04)

1. **Lundi 28/04** : si douleur épaule/coude/poignet réveillée par tractions → reporter "Lundi — Explosif Traction" et faire **uniquement** Trap Bar Jump à 25 % en test (5×2 reps lentes, valider qu'aucun mouvement ne réveille la zone).
2. **Si douleur > 5 jours ou s'aggrave** → kiné avant toute reprise. Compétition à 4 semaines : 3 jours de repos < 1 saison.
3. **Trap bar prise neutre** = position la plus sûre coiffe + poignets. Reprise progressive : 25 % lundi → 35 % mardi/mercredi → 45-50 % jeudi.

## Tableau de progression mis à jour (référentiel `plan complet coach et perso.docx`)

```
                | S1 test | S2  | S3  | S4-S6   | S7  | S8  | S9
Trap Bar Jump   |   ---   | --- | --- | 35-50%  | 40% | 35% | 25-30%
```

(Remplace la ligne `Power Clean | --- | --- | --- | 70-80% | 70% | 65% | 60%`.)

## Ce qui reste identique (méthode McEvoy intacte)

- Tractions lestées (pilier #1 McEvoy)
- Back Squat
- Soulevé de terre trap bar
- Bench Pull
- Dips lestés
- Ab Wheel Rollout
- Front Lever / Straight Arm Pulldown
- Squat Jump, Box Jumps, Med Ball Rotational Throws
- Périodisation Force Max → Puissance → Taper → Comp
- Format 17h muscu / 18h piscine / samedi sprint max

**Le clean était l'addendum Chris Hoy au programme McEvoy. McEvoy lui-même ne fait pas de clean : son travail "puissance" passe par la vitesse de barre sur les exercices de force et par le trap bar lourd. La révision rapproche donc le programme du vrai référentiel McEvoy.**
