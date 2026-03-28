# Design : Vidéo → GIF pour exercices de musculation

**Date** : 2026-03-28
**Statut** : Validé

## Objectif

Permettre aux coachs de filmer un exercice (ou importer une vidéo existante), raccourcir l'extrait, le convertir en GIF compressé, et le stocker comme illustration d'exercice.

## Flow utilisateur

1. Coach ouvre le formulaire création/édition d'exercice dans StrengthCatalog
2. Bouton unique "Illustration" → ouvre un bottom sheet avec 2 options :
   - "Filmer" (ouvre la caméra)
   - "Importer" (galerie)
   - Si image/GIF statique → upload direct (comportement actuel conservé)
   - Si vidéo → ouvre le **trimmer**
3. **Trimmer** (nouveau composant) :
   - Preview vidéo en lecture
   - Timeline avec 2 curseurs glissants (début/fin)
   - Contrainte : max 5 secondes d'extrait
   - Bouton "Créer le GIF"
4. **Conversion** (client-side, Canvas API + gifenc) :
   - Extraction ~10 frames (2 fps)
   - Redimensionnement à 240px de large (ratio conservé)
   - Assemblage GIF avec palette 256 couleurs
   - Cible : ≤200 KB
   - Spinner pendant le traitement
5. **Upload** vers bucket `exercise-gifs` existant → URL dans `illustration_gif`

## Architecture technique

| Composant | Rôle |
|-----------|------|
| `MediaSourceSheet` | Bottom sheet : Filmer / Importer |
| `VideoTrimmer` | Preview vidéo + curseurs début/fin (max 5s) |
| `gifEncoder.ts` | Util : extraction frames Canvas + assemblage GIF avec `gifenc` |
| `StrengthCatalog.tsx` | Modification du `handleGifUpload` existant |

## Librairie : gifenc

- ~15 KB gzipped
- API simple et synchrone
- Bonne quantification couleurs

## Contraintes

- Max 5 secondes d'extrait vidéo
- GIF final : 240px de large, ~10 frames, ≤200 KB
- Tout côté client (pas d'Edge Function)
- Bucket existant `exercise-gifs`, champ existant `illustration_gif`

## Ce qui ne change pas

- Le champ `illustration_gif` et le bucket `exercise-gifs`
- L'affichage des GIFs dans les composants existants
- Le comportement pour les images/GIF statiques (upload direct)
