# Design — Unification FolderCard + SessionRow

**Date** : 2026-04-16
**Objectif** : Unifier la visualisation des dossiers et lignes de séances entre nageur et coach.

## Contexte

Deux implémentations divergentes pour le même concept (dossiers de musculation) :
- **Nageur** : `CommonFolderList.tsx` — Radix Collapsible, border+bg-card, icône FolderOpen, sous-dossiers 2 niveaux, animations natives
- **Coach** : `FolderSection.tsx` — custom state toggle, pas de border/bg, pas d'icône dossier, flat seulement, Popover menu actions

Le nageur sert de référence visuelle. Le coach hérite du même look en ajoutant les actions CRUD.

## Décisions

1. **Style de référence** : nageur (border, bg-card, FolderOpen, Radix Collapsible, spacing px-3 py-2.5)
2. **Actions coach** : DropdownMenu Radix (remplace Popover) — meilleure accessibilité clavier
3. **Scope** : FolderCard + SessionRow + quick wins cohérence (radius, spacing, empty states)
4. **Sous-dossiers** : supportés partout (2 niveaux), le composant est récursif

## Composants

### `src/components/shared/FolderCard.tsx`

```ts
interface FolderCardProps {
  name: string;
  icon?: LucideIcon;          // default: FolderOpen
  count: number;
  defaultOpen?: boolean;
  variant?: "root" | "nested"; // default: "root"
  actions?: ReactNode;         // slot DropdownMenu (coach only)
  children: ReactNode;
}
```

Structure DOM :
- `Collapsible` > `CollapsibleTrigger` (rounded-xl border bg-card pour root, label simple pour nested)
- Trigger : icon + name + count (tabular-nums, sans parenthèses) + actions slot (stopPropagation) + ChevronRight (rotate-90)
- Content : `pl-3 pt-1 space-y-1` > children

Récursif : un sous-dossier est un `<FolderCard variant="nested">` dans les children du parent.

### `src/components/shared/SessionRow.tsx`

```ts
interface SessionRowProps {
  icon?: LucideIcon;           // default: Dumbbell
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  trailing?: ReactNode;        // default: ChevronRight animé
  onClick?: () => void;
  className?: string;
}
```

Structure DOM :
- `button` (rounded-lg px-2.5 py-2 hover:bg-accent/50)
- icon + title/badge row + subtitle + trailing slot

Pas de framer-motion — l'animation stagger reste dans le parent.

### Usage nageur

```tsx
<FolderCard name={root.name} count={total}>
  {directSessions.map(s => <SessionRow title={s.title} subtitle={`${s.items?.length ?? 0} ex.`} onClick={() => onStartCatalog(s)} />)}
  {subFolders.map(sub => (
    <FolderCard variant="nested" name={sub.name} count={sessions.length}>
      {sessions.map(s => <SessionRow ... />)}
    </FolderCard>
  ))}
</FolderCard>
```

### Usage coach

```tsx
<FolderCard name={folder.name} count={folderSessions.length}
  actions={<FolderDropdown onRename={...} onDelete={...} onCopy={...} />}
>
  {folderSessions.map(s => (
    <SessionRow title={s.title} subtitle={`${s.items?.length} ex.`} onClick={() => preview(s)}
      trailing={<SessionDropdown onEdit={...} onArchive={...} onDelete={...} />}
    />
  ))}
</FolderCard>
```

## Quick wins cohérence

| # | Quoi | Avant | Après |
|---|------|-------|-------|
| 1 | Border radius | coach `rounded-2xl` mixé | `rounded-xl` partout |
| 2 | Trigger spacing | coach `px-2 py-1.5` | `px-3 py-2.5` |
| 3 | Empty states | inline ad-hoc (border-dashed / Dumbbell) | `ui/empty.tsx` |
| 4 | Compteur | coach `(N)` | `N` sans parenthèses, tabular-nums |
| 5 | Icône dossier | coach aucune | `FolderOpen` par défaut |

## Fichiers impactés

**Créés** :
- `src/components/shared/FolderCard.tsx`
- `src/components/shared/SessionRow.tsx`

**Supprimés** :
- `src/components/strength/CommonFolderList.tsx`
- `src/components/coach/strength/FolderSection.tsx`

**Modifiés** :
- `src/components/strength/SessionBrowser.tsx` — utilise FolderCard + SessionRow
- `src/pages/coach/StrengthCatalog.tsx` — utilise FolderCard + SessionRow + DropdownMenu
- `src/components/strength/UnfiledSessionList.tsx` — utilise SessionRow (garde wrapper motion)
