# ChronoSetup — Refonte interface (Design Doc)

**Date :** 2026-04-20  
**Statut :** Approuvé  
**Périmètre :** `src/components/chrono/ChronoSetup.tsx` + sous-composants

---

## Contexte & motivation

L'interface de préparation des chronos souffre de **complexité perçue** : toutes les options (lignes, nageurs, séries, distance, splits, vagues, intervalles, overrides) sont visibles simultanément. Les coaches occasionnels sont perdus ; les experts n'ont pas besoin de voir les options avancées à chaque fois.

**Population cible :** mix experts + coaches occasionnels.  
**Usage :** debout au bord du bassin, souvent sur mobile/tablette, parfois une seule main.

---

## Décisions de design

| Question | Choix |
|---|---|
| Stratégie de simplification | Progressive disclosure |
| Minimum vital | Nageurs + Distance + Splits |
| Titre | Toujours visible (bonne pratique à encourager) |
| Séries / Vagues / Intervalles | Cachés dans "Avancé", replié par défaut |
| Action principale | Sticky footer toujours accessible |

---

## Structure générale

```
┌─────────────────────────────────────────┐
│ [✏ Titre de la séance………………………………]       │  titre — toujours visible
├─────────────────────────────────────────┤
│  NAGEURS                                │
│  ┌─ Ligne 1 ─────────────────────────┐  │
│  │  [Av] Marie [V1▾]  [Av] Tom [V2▾] │  │
│  │                       [+ Ajouter] │  │
│  └───────────────────────────────────┘  │
│  ┌─ Ligne 2 ─────────────────────────┐  │
│  │  Vide — tap + pour ajouter        │  │  ghost text si vide
│  │                       [+ Ajouter] │  │
│  └───────────────────────────────────┘  │
│  [− Lignes]  3  [+ Lignes]              │  compteur sous les lanes
├─────────────────────────────────────────┤
│  PROGRAMME                              │
│  Distance totale      Splits tous les   │
│  [−] [ 100 m ] [+]    [−] [ 50 m ] [+] │
│   50 · 100 · 200 · 400m   25 · 50 · 100m│  preset chips
│                                         │
│  ▶ Avancé · 3 séries · 2 vagues         │  replié + badge résumé
├─────────────────────────────────────────┤
│  (scroll zone)                          │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  3 nageurs · 100 m · splits 50 m        │
│                             [▶ Lancer]  │  sticky footer
└─────────────────────────────────────────┘
```

---

## Composants détaillés

### 1. Titre
Inchangé — input borderless avec icône `Pencil`, focus underline.

### 2. Bloc Nageurs

**Lane cards :**
- Le bouton `[+ Ajouter]` est toujours présent dans la card (aligné à droite)
- État vide : texte ghost `"Vide — tap + pour ajouter un nageur"` en italic muted
- Le compteur lignes `[− n +]` descend **sous** les lanes (priorité visuelle moindre)
- SwimmerChip inchangé (avatar + nom + wave chip + popover)

**Changements vs. existant :**
- Suppression du bouton `[+]` dashed séparé — intégré dans la card
- Lane vide plus explicite

### 3. Bloc Programme

**Steppers Distance + Splits :**
- Label descriptif au-dessus (`"Distance totale"` / `"Splits tous les"`)
- Layout 2 colonnes côte à côte sur ≥ 480px, empilé sur < 480px
- **Preset chips** sous chaque stepper :
  - Distance : `50` `100` `200` `400` `800` (pill cliquable, highlight si sélectionné)
  - Splits : `25` `50` `100` `200`
  - Implémentation : simple `<button>` pill avec `onClick={() => dispatch(...)}`
  - La chip active prend `bg-primary text-primary-foreground`, les autres `bg-muted`

### 4. Section Avancé

**Header replié :**
```tsx
<button onClick={toggleAdvanced}>
  {isOpen ? <ChevronDown /> : <ChevronRight />}
  Avancé
  {!isOpen && summaryBadge}   // "· 3 séries · 2 vagues" si non-défaut
</button>
```

**Contenu (inchangé fonctionnellement) :**
- Séries (stepper)
- WaveConfigCards existantes (une par vague active)

**Persistance :** `localStorage.getItem("eac-chrono-advanced-open")` — booléen, défaut `false`.

### 5. Sticky footer

```tsx
<div className="sticky bottom-0 z-10 border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3 flex items-center justify-between gap-4">
  <p className="text-sm text-muted-foreground truncate">{summary}</p>
  <Button disabled={swimmers.length === 0} onClick={() => dispatch({ type: "START_RACE" })}>
    <Play /> Lancer
  </Button>
</div>
```

- `summary` = `"3 nageurs · 100 m · splits 50 m"` — ou `"Ajoutez des nageurs pour commencer"` si vide
- Le bouton "Lancer" actuel du header est **supprimé** (remplacé par le footer)

---

## Ce qui ne change pas

- Sheet d'ajout (Club / Mémorisés / Nouveau) — fonctionnel, conservé tel quel
- SwimmerChip + Popover (déplacer/changer vague/supprimer)
- WaveConfigCard (interval + overrides)
- Logic reducer, dispatch, state — aucun changement

---

## Changements de fichiers attendus

| Fichier | Type |
|---|---|
| `src/components/chrono/ChronoSetup.tsx` | Modifié (principal) |
| Aucun nouveau fichier requis | — |

---

## Anti-patterns à éviter

- Ne pas recréer un wizard (trop rigide pour les experts)
- Ne pas masquer Distance/Splits dans "Avancé" (obligatoires)
- Ne pas supprimer le Sheet d'ajout (il fonctionne bien)
- Ne pas ajouter d'animation de transition lente sur le collapse (150ms max)
