# Design — Chrono temps de vol + illustrations animées KPI

*Validé le 2026-05-21. §295 (à venir).*

## 1. Objet

Deux pièces UI dans le wizard de saisie des 5 KPIs (`/strength/kpi-wizard`) :

1. Remplacer la saisie texte manuelle des **temps de vol** du KPI détente verticale par un **module chrono Start/Stop intégré** à l'app — le binôme tient le téléphone et tape pour mesurer chaque saut.
2. Remplacer le placeholder « Démonstration à venir » du panneau GIF par des **illustrations SVG animées** — une par protocole KPI — qui montrent le mouvement sans nécessiter d'asset binaire externe.

Cible : améliorer la fluidité et la précision du bilan KPI sans dépendance asset externe, et débloquer les utilisateurs qui n'ont ni chrono ni vidéos sous la main.

## 2. Décisions de cadrage

| # | Décision | Choix retenu |
|---|----------|--------------|
| 1 | Mode de mesure temps de vol | **Chrono intégré tactile** (Start → Stop par tap). Fallback saisie manuelle accessible. |
| 2 | Précision | `performance.now()` en interne (sub-ms), affichage 2 décimales en secondes (`0.52`). |
| 3 | Détection automatique (accéléromètre) | **Non** — le téléphone est tenu par le binôme, pas porté par le nageur. Pas pertinent. |
| 4 | Format des illustrations | **SVG inline animés** via CSS keyframes (1 composant React par KPI). |
| 5 | Compat asset binaire | Slot `gifUrl` reste prioritaire — si un vrai GIF/MP4 est fourni, il remplace l'animation SVG sans changement de code. |
| 6 | Bibliothèque d'animation | Aucune (CSS keyframes natifs). Pas de Lottie, pas de framer-motion. |

## 3. Périmètre

**Dans le périmètre** :
- `KpiStopwatch.tsx` — composant chrono autonome (state machine `idle | running | stopped`, mesure via `performance.now()`).
- `VerticalJumpInputs.tsx` — refactor : chrono par défaut, fallback texte révélable.
- `KpiAnimatedIllustration.tsx` + 5 sous-composants SVG (`VerticalJumpAnim`, `BroadJumpAnim`, `ImtpAnim`, `WeightedPullupAnim`, `MedballThrowAnim`).
- `KpiGifPanel.tsx` — rend l'illustration animée quand `gifUrl === null`, le `<img>` sinon.
- Tests unitaires pour `KpiStopwatch` (state machine + format) — pas de tests pour les anims SVG.

**Hors périmètre** :
- Migration data du catalogue (les `gifUrl` restent null, l'override binaire restera à fournir plus tard).
- Détection mouvement / accéléromètre.
- Modification du moteur de scoring KPI / barèmes.
- Tracking des temps individuels en base (`attempts` JSONB conserve déjà les 3 flight_times).

## 4. UX du chrono

### 4.1 États

```
   idle ──── tap "Démarrer" ───▶ running
     ▲                              │
     │                       tap "Arrêter"
     │                              ▼
     ├───── tap "Refaire" ──── stopped
     │                              │
     └───── tap "Essai suivant" ────┘
```

### 4.2 Maquette ASCII

```
┌────────────────────────────────────────────────┐
│  Temps de vol — 3 essais                       │
│                                                │
│   Essai 1 ✓ 0.51 s  ↺                          │
│   Essai 2 ✓ 0.48 s  ↺                          │
│   Essai 3 — à mesurer                          │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │                                          │ │
│  │              ⏱  0.00 s                   │ │
│  │                                          │ │
│  │          ▶  Démarrer essai 3             │ │
│  │                                          │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  Saisir manuellement →                         │
└────────────────────────────────────────────────┘
```

Pendant la mesure :

```
│  ┌──────────────────────────────────────────┐ │
│  │                                          │ │
│  │              ⏱  0.34 s   ← live          │ │
│  │                                          │ │
│  │          ⏹  Arrêter   (rouge)            │ │
│  │                                          │ │
│  └──────────────────────────────────────────┘ │
```

### 4.3 Comportements

- Tap **Démarrer** → `tStart = performance.now()`, état `running`, animation `requestAnimationFrame` met à jour `displayedSeconds` ~ chaque 16 ms (60 fps).
- Tap **Arrêter** → `tEnd = performance.now()`, `flightTimeSeconds = (tEnd - tStart) / 1000`, état `stopped`, value pushed dans `flightTimesRaw[currentIndex]` au format `'0.52'`.
- Après stop, le bouton bascule sur « Essai suivant » (idle pour l'index N+1).
- **Refaire** (↺) sur un essai stop → reset cet essai et reprend la mesure.
- **Saisir manuellement** → toggle qui révèle les 3 `<Input>` actuels (l'ancien composant), masque le chrono. Le toggle reste sticky tant qu'il n'est pas inversé.
- Sur mobile : `navigator.vibrate(50)` au start, `navigator.vibrate([0, 50, 50, 50])` au stop (feedback haptique). Pas bloquant si l'API absente.
- Aria-live="polite" sur le readout pour les SR.

### 4.4 Précision et sanité

- Précision théorique : `performance.now()` ~5 µs, mais le binôme humain a un délai de réaction ~150-250 ms. La précision **utile** est donc ~50 ms (l'erreur d'un binôme attentif).
- Aucune validation contre les valeurs absurdes ici — c'est traité plus loin par `verticalJumpResult` (qui throw si t > 1.5s par exemple). Le chrono pose ce qu'il mesure.
- Format de stockage : `'0.52'` (string avec 2 décimales) — compat exacte avec l'input texte actuel, aucun changement de la chaîne `parseAttempts` → `verticalJumpResult`.

## 5. Illustrations SVG animées

### 5.1 Style commun

- ViewBox 320×180 (ratio 16:9, cohérent avec le placeholder `aspect-video`).
- Trait monochrome `stroke="currentColor"` → s'adapte automatiquement au dark/light mode.
- Pas de remplissage (formes vides) sauf petits points cardinaux (sol, barre, ballon).
- Anim CSS keyframes en `<style>` inline, suffixées par un préfixe unique par composant pour éviter les collisions.

### 5.2 Animations (1 par KPI)

| KPI | Cycle | Mouvement |
|---|---|---|
| `vertical_jump` | 2.5s | Silhouette : debout → flexion → saut vertical (translateY -40px sur 0.5s) → réception |
| `broad_jump` | 2.0s | Silhouette : pieds joints → flexion → saut avant (translateX +60px arc parabolique) → réception |
| `imtp` | 1.8s | Silhouette : prise pronation barre au rack mi-cuisse → tirage vertical (barre monte) → repose |
| `weighted_pullup` | 2.0s | Silhouette suspendue à la barre → montée (translateY -30px) → descente |
| `medball_vertical_throw` | 2.2s | Silhouette couchée → mains arment près de la poitrine → propulsion ballon (translateY -50px) |

### 5.3 Composant générique

```tsx
// KpiAnimatedIllustration.tsx
export function KpiAnimatedIllustration({ kpiKey, label }: Props) {
  switch (kpiKey) {
    case 'vertical_jump': return <VerticalJumpAnim aria-label={label} />;
    // ... etc
  }
}
```

`KpiGifPanel.tsx` post-refactor :

```tsx
if (gifUrl) return <img src={gifUrl} … />;
return <KpiAnimatedIllustration kpiKey={kpiKey} label={label} />;
```

## 6. Modèle de données / API

**Aucun changement**. `flight_times[]` reste un `number[]` stocké dans `strength_kpi_measurements.attempts` (jsonb). Le chrono produit les mêmes strings que les inputs texte (`'0.52'`), `verticalJumpResult` reste agnostique à la source.

`KPI_PROTOCOLS.*.gifUrl` reste `null` — pas de migration de seed. L'override binaire restera dispo en ajoutant `gifUrl: 'https://...'` au protocol quand l'asset existera.

## 7. Tests

| Cible | Niveau |
|---|---|
| `KpiStopwatch` — state machine (idle → running → stopped → idle) | unit (vitest, fake timers) |
| `KpiStopwatch` — formatSeconds(t) renvoie 2 décimales | unit |
| `KpiStopwatch` — Refaire reset le slot | unit |
| `VerticalJumpInputs` — toggle fallback affiche/masque chrono ↔ inputs texte | unit (RTL) |
| Anims SVG | **pas de tests** (purement visuel, statique à validation manuelle) |
| `KpiGifPanel` — branche `gifUrl ? <img> : <KpiAnimatedIllustration>` | unit (RTL) |

`tsc --noEmit` + `npm run build` + `npm test` doivent tous passer.

## 8. Hors scope explicite

- **Asset binaire (GIF/MP4)** — le slot `gifUrl` reste ouvert. Si un coach fournit 5 vidéos demain, un simple UPDATE `dim_exercices` + ajout dans `KPI_PROTOCOLS.gifUrl` les active. SVG animé devient le fallback.
- **Détection auto via capteur** — out.
- **Anim sur les bucket icons / autres écrans muscu** — out.
- **Internationalisation** — les illustrations sont muettes ; les labels FR existent déjà.

## 9. Points laissés à l'implémentation

- **Format exact des 5 anims SVG** — la lib graphique de prédilection (frontend-design skill) déterminera la silhouette précise (proportions, traits, intensité). La timing keyframe est figée ici, l'esthétique ouverte.
- **Hauteur du bouton chrono** — proposé h-32 (128px), à ajuster en review live si trop massif.
- **Persistance offline** — le chrono fonctionne en client pur, aucune dépendance réseau.
