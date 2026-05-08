# Design — Redesign vues Messages (§196+)

**Date :** 2026-05-08  
**Approche retenue :** Option A — iOS Mail light  
**Périmètre :** `SwimmerMessagesView` (nageur) + `CoachMessagesScreen` (coach)

---

## Contexte

Les deux vues "message" sont jugées trop chargées sur mobile. Problèmes identifiés :

- **Vue nageur :** pattern split (card détail fixe en haut + liste scrollable en dessous) crée une UX confuse sur mobile ; trop de Cards imbriquées, borders, badges
- **Vue coach :** 3 Cards inutiles autour des champs de formulaire, une Card "info" redondante en bas

---

## Vue nageur — `SwimmerMessagesView`

### Layout

Liste plein écran. Tap sur une row = **expansion inline** (accordion) qui pousse les rows suivantes vers le bas. Suppression de la card détail flottante en haut.

### Anatomie d'une row

```
[dot] Titre de la notif          il y a 5m
      Début du message tronqué…       [X]
      ↓ expanded :
      ┌──────────────────────────────────┐
      │ Texte complet de la notification │
      │ [→ Voir la séance]               │
      └──────────────────────────────────┘
```

- **Non-lu :** `bg-primary/8`, dot `h-2 w-2 rounded-full bg-primary` à gauche, titre `font-semibold`
- **Lu :** fond transparent, pas de dot, titre `font-normal text-muted-foreground`
- **Expanded :** bloc `bg-card border border-border/60 rounded-xl p-3 mt-2` injecté sous le contenu de la row
- **CTA action :** `Button size="sm" variant="outline"` uniquement si `resolveNotificationActionLabel` retourne une valeur
- **Dismiss (X) :** `Button variant="ghost" size="icon"` `h-7 w-7`, toujours visible sur mobile, hover-only sur desktop via `sm:opacity-0 sm:group-hover:opacity-100`
- **Date :** format relatif (`il y a Xm`, `il y a Xh`, `hier`, `lun.`, `jj/mm`) via helper `formatRelativeDate`

### Header

```
Messages [3]          [Tout effacer]
```

- `h2` "Messages" + `Badge` count non-lus `bg-primary text-primary-foreground rounded-full px-1.5`
- Bouton "Tout effacer" : `variant="ghost" size="sm"` à droite, conditionnel sur `notifications.length > 0`
- Pas de subtitle

### États

- **Loading :** 3 skeletons `h-14 rounded-xl animate-pulse`
- **Empty (zéro notif) :** inchangé — Card centré avec `Inbox` icon
- **Empty (tout masqué) :** inchangé — même Card avec bouton "Réafficher"

---

## Vue coach — `CoachMessagesScreen`

### Layout

Formulaire sans Cards. Champs empilés directement dans la page, séparés par `space-y-5`.

```
← Retour
Envoyer un message

Destinataire
[Select nageur/groupe ▼]
3 nageurs ciblés

Titre *
[Input]

Message (optionnel)
[Textarea rows=3]

─ sticky ─────────────────────────
[↗ Envoyer la notification]
```

### Changements vs actuel

| Actuel | Redesign |
|--------|----------|
| 3 `Card` (Destinataire, Notification, Info) | Supprimées — champs directs |
| `CardHeader > CardTitle + CardDescription` | `Label` simple au-dessus du champ |
| Card info "appareils abonnés" en bas | Retiré — info déplacée dans le toast de confirmation |
| Compteur nageurs dans `CardContent` | `p` `text-xs text-muted-foreground` inline sous le Select |

### CTA

- Sticky bottom conservé : `sticky bottom-0 border-t bg-background/95 p-4 backdrop-blur`
- `Button className="w-full"` (pas de `sm:w-auto` — cohérence mobile-first)

---

## Fichiers impactés

| Fichier | Action |
|---------|--------|
| `src/components/profile/SwimmerMessagesView.tsx` | Refonte complète layout |
| `src/pages/coach/CoachMessagesScreen.tsx` | Suppression Cards, simplification |
| `src/lib/date.ts` (ou nouveau helper) | Ajouter `formatRelativeDate` |

## Non-périmètre

- `CoachCommentsScreen` — non touché
- Logique métier (mark-read, dismiss, clear-all, send) — inchangée
- Tests existants — à adapter si signatures de composants changent
