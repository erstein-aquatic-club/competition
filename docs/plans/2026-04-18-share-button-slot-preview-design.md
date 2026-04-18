# Bouton de partage dans la preview séance — vue créneaux

## Contexte

La vue créneaux coach (`CoachTrainingSlotsScreen.tsx`) ouvre `SlotSessionSheet.tsx` au tap d'un créneau. En état `draft` ou `published`, l'utilisateur peut taper sur la carte de la séance pour entrer en mode preview (`previewOpen = true`, lignes 292-329) qui affiche la `SwimSessionTimeline` complète.

Le partage public de séance existe déjà ailleurs (catalogue coach `SwimCatalog.tsx:569`) via :
- `generateShareToken(catalogId)` — `src/lib/api/swim.ts:239`
- `navigator.share` (Web Share API) avec fallback `navigator.clipboard.writeText` + toast

Aujourd'hui ce partage n'est pas accessible depuis la vue créneaux.

## Objectif

Ajouter un bouton de partage dans le header de la preview séance de `SlotSessionSheet.tsx`, en réutilisant exactement le pattern existant de `SwimCatalog.tsx` pour rester cohérent.

## Design

### Emplacement

Header du mode preview de `SlotSessionSheet.tsx` (~ligne 299). Bouton icône `Share2` (lucide-react) à droite, en symétrie avec le bouton retour `ArrowLeft` à gauche. Le titre de la séance reste entre les deux boutons.

### Comportement

Au clic :
1. Appel `generateShareToken(assignment.swim_catalog_id)` — réutilise la fonction existante.
2. Construction de l'URL : `${origin}${pathname}#/s/${token}`.
3. Si `navigator.share` disponible → ouvre la sheet native (`title: assignment.session_name, url`).
4. Sinon → `navigator.clipboard.writeText(url)` + toast "Lien copié !".
5. Toast d'erreur destructive en cas d'échec.

Logique strictement identique à `SwimCatalog.tsx:569-582`.

### État local

- `isSharing: boolean` — désactive le bouton pendant la génération du token (évite double-clic / double-toast).

### Garde

Le bouton n'est rendu que si `assignment?.swim_catalog_id != null`. Le mode preview est déjà gardé par cette condition (`onPreview` n'est passé qu'à cette condition, ligne 401), donc c'est redondant mais on le conserve pour la robustesse TypeScript et pour résister à un changement futur du gating de la preview.

## Hors scope (YAGNI)

- Pas d'écran de gestion des liens partagés (révocation, expiration) — la fonction `generateShareToken` est idempotente et retourne le token existant si déjà émis.
- Pas de personnalisation du message partagé — on garde `title` = nom de la séance, comme partout ailleurs.
- Pas de partage depuis la vue normale (`FilledBody`) — l'utilisateur a explicitement demandé "depuis la preview séance".

## Tests

Pas de couverture automatisée requise : la logique métier (`generateShareToken`) est inchangée, et le wrapper UI est trivial. Vérification manuelle :
- Tap sur séance dans un créneau publié → preview s'ouvre → bouton partage visible.
- Clic bouton sur appareil supportant Web Share API → sheet native s'ouvre.
- Clic bouton sur desktop → URL copiée + toast confirmation.
- Erreur réseau simulée → toast destructive.

## Fichiers impactés

- `src/components/swim/SwimSessionTimeline.tsx` — aucun changement.
- `src/pages/coach/SlotSessionSheet.tsx` — ajout du bouton + handler partage. Une seule modification, autour de la ligne 299.
