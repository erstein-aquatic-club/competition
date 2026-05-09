# Design — Profile Edit : section inline (§228)

*Date : 2026-05-08*

## Contexte

La vue "Modifier le profil" est actuellement un `Sheet` (bottom drawer Shadcn). Sur mobile, elle génère un scroll horizontal et son style ne correspond pas aux cards `rounded-2xl border border-border/70` du reste de la page Profile.

## Décision

**Option B — section inline dans `Profile.tsx`**, en utilisant le mécanisme `activeSection` déjà en place.

## Structure & navigation

- `ProfileSection` passe de `"home" | "messages" | "neurotype-quiz" | "neurotype-result"` à :
  `"home" | "messages" | "neurotype-quiz" | "neurotype-result" | "edit" | "password"`
- Les états `isEditSheetOpen` et `isPasswordSheetOpen` sont supprimés.
- `startEdit()` → `setActiveSection("edit")`
- Bouton "Sécurité" → `setActiveSection("password")`
- Retour → `setActiveSection("home")`
- Les deux `<Sheet>` sont supprimés du JSX.

## Layout de la page "edit"

Header : `ChevronLeft` + titre "Modifier le profil" (même pattern que Messages/Neurotype).

Corps en `space-y-4` avec `overflow-x-hidden` :

### Card "Photo de profil"
- Avatar 80px centré
- Bouton "Changer la photo" (full-width, variant outline)
- Bouton "Supprimer" (full-width, variant ghost destructive) — visible si `profile?.avatar_url`

### Card "Informations"
- Groupe (Select, full-width)
- Bio (Textarea, full-width, maxLength 500)
- Date de naissance (Input type="date", full-width)
- Téléphone (Input type="tel", full-width)

### Card "Identifiant FFN" (athletes uniquement — `showRecords`)
- IUF FFN (Input inputMode="numeric", full-width)
- Texte helper sous le champ

### Bouton Enregistrer
- `w-full`, variant primary, avec état loading
- Pas de bouton "Annuler" séparé — le header assure le retour

## Layout de la page "password"

Header : `ChevronLeft` + titre "Sécurité".

- Card avec 2 champs (nouveau mot de passe, confirmation) + règles de validation
- Bouton "Mettre à jour" full-width

## Contraintes techniques

- Tous les containers : `w-full max-w-full overflow-x-hidden`
- Aucun `flex` horizontal avec éléments de largeur fixe non bornée
- Input date : wrapper `w-full` explicite pour neutraliser le rendu natif iOS
- Même token styling que `ProfileActionRow` : `rounded-2xl border border-border/70 bg-background/70 px-4 py-3`

## Fichiers impactés

- `src/pages/Profile.tsx` — seul fichier modifié

## Hors scope

- Logique de mutation (inchangée)
- Schémas Zod (inchangés)
- Navigation hash (inchangée)
