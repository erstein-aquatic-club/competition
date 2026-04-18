# Share Menu — WhatsApp + Clipboard (coach)

*Design validé — 2026-04-18*

## Contexte

Le coach utilise l'app sur macbook (WhatsApp Desktop installé). Les 4 boutons "Partager" actuels appellent `navigator.share()`, qui ouvre la feuille système macOS — laquelle n'inclut pas WhatsApp par défaut (il faut l'activer manuellement dans Réglages → Extensions). Résultat : friction, le coach n'utilise pas le partage.

Deux demandes :
1. Partage WhatsApp natif (1 clic, sans passer par la feuille système).
2. Option "Copier dans le presse-papier".

## Points de partage concernés (4)

| Fichier | Ligne | Type | Contenu |
|---|---|---|---|
| `src/pages/coach/SlotSessionSheet.tsx` | 279 | URL | Lien séance (token) |
| `src/pages/SwimSessionView.tsx` | 269 | URL | Lien séance courante |
| `src/pages/coach/SwimCatalog.tsx` | 569 | URL | Lien séance catalogue |
| `src/pages/coach/CoachTrainingSlotsScreen.tsx` | 2151 | Image PNG | Export semaine |

## Décisions

- **Pattern UI** : dropdown menu (Radix `DropdownMenu`) à la place du bouton unique actuel.
- **Contenu WhatsApp (lien)** : URL seule (`https://wa.me/?text=<encoded_url>`).
- **Contenu WhatsApp (image)** : two-step — copier image dans clipboard + ouvrir `web.whatsapp.com` + toast `"Image copiée. Collez dans la conversation (⌘+V)."`
- **Plateformes** : menu partout (desktop + mobile). Option "Partager…" (native `navigator.share`) conservée en dernière position si `canShare(data) === true`, pour garder accès AirDrop/iMessage/Mail.
- **Refactor** : un seul chantier, les 4 points migrent ensemble.

## Architecture

```
src/lib/share/
├── buildShareOptions.ts         # (payload) → ShareOption[]
├── shareActions.ts              # side-effects : openWhatsApp, copyText, copyImage, nativeShare, downloadImage
└── __tests__/buildShareOptions.test.ts

src/components/shared/
├── ShareMenu.tsx                # <DropdownMenu> Radix, orchestrateur
├── icons/WhatsAppIcon.tsx       # SVG inline, couleur #25D366
└── __tests__/ShareMenu.test.tsx
```

### API composant

```tsx
<ShareMenu
  payload={{ url?, text?, title?, imageBlob?, imageFileName? }}
  onOpen?={async () => SharePayload}   // lazy resolution (génération token à la demande)
  trigger={<Button><Share2 /></Button>}
/>
```

- `payload` direct si tout est déjà dispo (ex: `SwimSessionView`).
- `onOpen` pour lazy-générer le contenu (ex: token de partage via `generateShareToken(catalogId)`), retourne le payload au moment du clic sur le trigger, pas au montage.
- Trigger disabled pendant `onOpen` en cours ; toast erreur si reject.

### Logique `buildShareOptions`

Pure (testable) — retourne liste d'options selon payload :

| Option | Condition | Action |
|---|---|---|
| **WhatsApp** (lien) | `url` ou `text` fourni | `window.open('https://wa.me/?text=' + encodeURIComponent(url))` |
| **WhatsApp** (image) | `imageBlob` fourni ET `typeof ClipboardItem !== 'undefined'` | `clipboard.write([ClipboardItem({image/png: blob})])` + `window.open('https://web.whatsapp.com')` + toast |
| **Copier le lien** | `url` ou `text` fourni | `clipboard.writeText(...)` + toast |
| **Copier l'image** | `imageBlob` fourni ET `ClipboardItem` supporté | `clipboard.write([ClipboardItem(...)])` + toast |
| **Télécharger** | `imageBlob` fourni | `<a download>` + click + revoke |
| **Partager…** | `navigator.share && navigator.canShare(data)` | `navigator.share(data)`, catch AbortError |

## Intégration par call site

1. **`SlotSessionSheet`** : bouton header → `<ShareMenu onOpen={async () => ({ url: buildUrl(await generateShareToken(catalogId)), title: sessionName })} />`. Supprime `handleShare` + `isSharing`.
2. **`SwimSessionView`** : idem, `payload={{ url: window.location.href, title: assignment.title }}` (pas de `onOpen`, synchrone).
3. **`SwimCatalog`** : actuellement `onShare` passé à `SessionListView` (Dropdown existant). Imbrique `DropdownMenuSub` Radix dans `SessionListView` pour rendre le sous-menu inline.
4. **`CoachTrainingSlotsScreen`** : remplace `shareOrDownloadPng`. `onOpen` englobe `buildFallbackWeekPng()` → retourne `{ imageBlob, imageFileName, title: "Créneaux semaine" }`.

## Tests

**Unitaires** (`buildShareOptions.test.ts`) :
- URL → `[WhatsApp, Copier, Partager?]`
- Image → `[WhatsApp(clipboard), Copier image, Télécharger, Partager?]`
- `navigator.share` absent → option Partager omise
- `ClipboardItem` indéfini → options image-clipboard omises
- Encodage URL sur caractères spéciaux

**Composant** (`ShareMenu.test.tsx`, Testing Library) :
- Trigger ouvre menu, rend options selon payload
- Clic WhatsApp (URL) → `window.open` bon wa.me
- Clic Copier → `clipboard.writeText` + toast
- `onOpen` async appelé une fois, erreur → toast erreur
- Double-clic trigger → disabled pendant `onOpen`

## Edge cases

- **Firefox desktop** : `ClipboardItem` images non supporté → options image-clipboard masquées, Télécharger + Partager restent.
- **Safari iOS** : `clipboard.write` images supporté depuis iOS 13.4.
- **User annule `navigator.share`** → `AbortError` silencieux.
- **`onOpen` reject** (ex: token generation fail) → toast erreur, menu reste fermé.

## Hors scope

- WhatsApp réellement installé (impossible depuis le navigateur).
- Navigateurs secondaires (Brave, Arc) — supposés Chromium-compatibles.
- SMS / iMessage / Telegram directs (YAGNI — coach demande uniquement WhatsApp).

## Documentation à mettre à jour

- `CLAUDE.md` — tableau Fichiers clés : `src/lib/share/*`, `src/components/shared/ShareMenu.tsx`, `src/components/shared/icons/WhatsAppIcon.tsx`.
- `docs/implementation-log.md` — §128 (nouvelle entrée).
- `docs/ROADMAP.md` — nouvelle ligne "Partage WhatsApp + clipboard coach".
