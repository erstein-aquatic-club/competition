# Design — Chrono Coach (Split Timer Poolside)

**Date** : 2026-04-10
**Statut** : Validé

## Objectif

Page "Chrono" réservée tablette/desktop permettant au coach de chronométrer les splits de nageurs par ligne d'eau et par vague de départ, puis d'exporter les résultats vers le profil de chaque nageur.

## Contraintes

- Tablette/desktop uniquement (masqué sur mobile avec message)
- Cas typique : 3 lignes × 3-6 nageurs = 9-18 nageurs, jusqu'à 6 vagues
- Cas étendu : jusqu'à 8 lignes avec moins de nageurs par ligne
- Ergonomie poolside : mains mouillées, gros boutons (min 48px, idéal 56-64px)
- Thème sombre (réduction éblouissement)
- Interface en français

## Esthétique

Direction : **"Olympic Scoreboard"** — sombre, haut contraste, industriel. Inspiré des systèmes de chronométrage Omega. Chiffres monospace tabulaires, vagues color-codées, chrome minimal.

- Typographie : monospace tabulaire pour les temps (JetBrains Mono ou similaire), sans-serif pour les labels
- Couleurs vagues : V1 cyan, V2 orange, V3 vert, V4 rose, V5 jaune, V6 violet
- Fond sombre, cartes semi-transparentes avec bordure colorée selon la vague

## Flow

```
Préparation ──[Lancer]──▶ En course ──[Terminer]──▶ Résultats
     ▲                                                   │
     └──────────── [Nouvelle série] ◄────────────────────┘
                  (nageurs conservés,
                   réarrangement possible)
```

## Phase 1 — Préparation (Setup)

### Layout

- Header : titre "Chrono" + bouton [Lancer] (désactivé si aucun nageur)
- Contrôles : nombre de lignes (+/-), indicateur vagues existantes
- Zone principale : lignes d'eau horizontales, chaque ligne contient les cartes nageurs + bouton "+ Ajouter"

### Interactions

- **+/- lignes** : ajuste 1-8 lignes
- **+ Ajouter** : picker de nageurs (profils app), recherche par nom
- **Vague** : chip coloré cliquable par nageur, cycle V1→V2→V3…
- Les vagues se créent automatiquement à l'assignation
- **Suppression** : long-press ou bouton ✕ sur la carte
- **[Lancer]** : passe en phase Course

## Phase 2 — En course (Race)

### Layout

- **Barre de vagues** (haut) : une carte par vague
  - Vague non lancée → gros bouton **▶ GO** pulsant
  - Vague lancée → chrono en cours + "En course"
- **Zone principale** : lignes d'eau horizontales, cartes nageurs

### Cartes nageurs (split buttons)

- **Toute la carte est cliquable** = enregistre un split
- Bordure gauche + fond subtil colorés selon la vague
- Nageur dont la vague n'est pas lancée → carte grisée, non cliquable

Contenu de chaque carte :
- Nom + indicateur vague (haut)
- Chrono live en gros chiffres monospace (temps cumulé depuis GO de sa vague)
- Dernier split : numéro + temps cumulé + temps partiel entre parenthèses
- Zone "TAP" indicative en bas

### Feedback

- Flash lumineux bref (pulse couleur de vague) au tap
- Vibration haptic si disponible (`navigator.vibrate`)
- Split instantané

### Annulation

- Swipe gauche ou double-tap rapide → annule dernier split + toast confirmation

### Bouton Terminer

- Haut à droite, arrête tous les chronos, passe en phase Résultats

## Phase 3 — Résultats & Export

### Layout

- Cartes par nageur (groupées par ligne), dépliables si beaucoup de splits
- Chaque carte affiche :
  - Nom + vague
  - Liste des splits : numéro, temps cumulé, temps partiel
  - Meilleur partiel surligné en vert
  - Temps total
  - Statut export : ⏳ En attente / ✓ Envoyé / ✗ Erreur

### Interactions

- **[Envoyer à tous]** : exporte vers le profil de chaque nageur (détails techniques). Statut individuel affiché.
- **[Nouvelle série]** : retour en Préparation avec nageurs conservés. Le coach peut :
  - Déplacer un nageur entre lignes (drag ou menu)
  - Changer la vague (tap chip coloré)
  - Ajouter/retirer des nageurs

## Routing

- Section coach via query param : `/coach?section=chrono`
- Accessible uniquement sur tablette/desktop (breakpoint `md:` / 768px+)
- Sur mobile : message invitant à utiliser une tablette

## Données

- **Sauvegarde locale** pendant la série (state React + localStorage backup)
- **Export en fin de série** vers les détails techniques de chaque nageur via l'API existante
- Pas de persistance long-terme de la série elle-même (éphémère)

## Nageurs sélectionnables

- Uniquement les profils ayant un compte dans l'app
- Picker avec recherche par nom, filtrable par groupe
