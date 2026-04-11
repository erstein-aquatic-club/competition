# Design : Admin = Coach Masterview

**Date** : 2026-04-10
**Statut** : Validé

## Contexte

L'admin a actuellement une interface minimale (Dashboard nageur + 3 liens nav) et doit taper manuellement `/coach` pour accéder à l'interface coach. L'objectif est que l'admin utilise l'interface coach comme vue principale avec accès à tous les nageurs, et que ses pages admin-only soient accessibles via sa page Profil.

## Principe

L'admin = coach masterview. Même nav, même interface, mais sans filtrage par attribution coach (voit tous les nageurs). Pages admin-only (Gestion comptes, Comité, Records Admin) déplacées en liens dans la page Profil.

## Changements

### 1. Routing (`App.tsx`)

Route `/` pour admin redirige vers `/coach` (même comportement que le coach actuel).

### 2. Navigation (`navItems.ts`)

L'admin reprend les 5 items coach :
1. Semaine (`/coach?section=week`)
2. Nageurs (`/coach?section=swimmers`)
3. Biblio (`/coach?section=library`)
4. Home (`/coach`)
5. Chrono (`/coach?section=chrono`)

Suppression des 3 anciens items admin (Profil, Gestion comptes, Records).

### 3. Filtre par coach sur CoachSwimmersOverview

- Dropdown en haut de la page Nageurs : "Tous" / "Coach X" / "Coach Y"
- Visible uniquement pour les admins
- Filtre UI local (pas de changement du hook global `useMySwimmerIds`)

### 4. Page Profil (`Profile.tsx`)

Section "Administration" visible si `role === "admin"` avec 3 liens :
- Gestion des comptes → `/admin`
- Comité → `/comite`
- Records Admin → `/records-admin`

### 5. Hook `useMySwimmerIds`

Pour l'admin : retourner tous les nageurs (pas de filtrage par `coach_assignments`).

## Ce qui ne change pas

- Pages `/admin`, `/comite`, `/records-admin` inchangées
- Guards `role === "coach" || role === "admin"` dans les pages coach inchangés
- Interface coach inchangée visuellement
