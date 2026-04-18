# Share Menu — WhatsApp + Clipboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remplacer les 4 boutons `navigator.share()` existants par un dropdown menu unifié (WhatsApp direct + Copier + Partager natif) pour débloquer le workflow coach sur macOS (WhatsApp Desktop non disponible dans la feuille système par défaut).

**Architecture:** Un composant `ShareMenu` (Radix `DropdownMenu`) + un helper pur `buildShareOptions` + actions isolées (`shareActions.ts`). Le menu reçoit un `payload` (url/texte/image) et rend dynamiquement les options pertinentes. Résolution lazy via `onOpen?: () => Promise<Payload>` pour ne générer les tokens de partage qu'au moment du clic.

**Tech Stack:** React 19, TypeScript, Radix `DropdownMenu` (déjà présent), Vitest + Testing Library, Tailwind 4, `lucide-react` (icônes) + SVG inline pour WhatsApp.

**Design doc:** `docs/plans/2026-04-18-share-menu-whatsapp-clipboard-design.md`

---

## Task 1: WhatsApp icon (SVG inline)

**Files:**
- Create: `src/components/shared/icons/WhatsAppIcon.tsx`

**Step 1: Créer l'icône**

Composant fonctionnel stateless, pas de test dédié (SVG pur).

```tsx
import type { SVGProps } from "react";

export function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/shared/icons/WhatsAppIcon.tsx
git commit -m "feat(share): add WhatsApp SVG icon"
```

---

## Task 2: `buildShareOptions` — types + tests

**Files:**
- Create: `src/lib/share/types.ts`
- Create: `src/lib/share/__tests__/buildShareOptions.test.ts`

**Step 1: Écrire les types**

```ts
// src/lib/share/types.ts
export type SharePayload = {
  url?: string;
  text?: string;
  title?: string;
  imageBlob?: Blob;
  imageFileName?: string;
};

export type ShareOptionId =
  | "whatsapp-link"
  | "whatsapp-image"
  | "copy-link"
  | "copy-image"
  | "download-image"
  | "native-share";

export type ShareOption = {
  id: ShareOptionId;
  label: string;
};
```

**Step 2: Écrire les tests (TDD — failing first)**

```ts
// src/lib/share/__tests__/buildShareOptions.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildShareOptions } from "../buildShareOptions";

describe("buildShareOptions", () => {
  const originalNavigator = globalThis.navigator;
  const originalClipboardItem = globalThis.ClipboardItem;

  afterEach(() => {
    globalThis.navigator = originalNavigator;
    globalThis.ClipboardItem = originalClipboardItem;
  });

  function mockEnv(opts: { canShare?: boolean | null; clipboardItem?: boolean }) {
    const nav: Partial<Navigator> = {};
    if (opts.canShare === true) {
      nav.share = vi.fn();
      nav.canShare = vi.fn(() => true) as Navigator["canShare"];
    } else if (opts.canShare === false) {
      nav.share = vi.fn();
      nav.canShare = vi.fn(() => false) as Navigator["canShare"];
    }
    // canShare === null → navigator.share absent
    globalThis.navigator = nav as Navigator;
    if (opts.clipboardItem === false) {
      // @ts-expect-error - suppression volontaire
      delete globalThis.ClipboardItem;
    } else {
      globalThis.ClipboardItem = class {} as typeof ClipboardItem;
    }
  }

  it("URL payload → WhatsApp + Copier + Partager (if canShare)", () => {
    mockEnv({ canShare: true, clipboardItem: true });
    const options = buildShareOptions({ url: "https://example.com", title: "t" });
    expect(options.map((o) => o.id)).toEqual([
      "whatsapp-link",
      "copy-link",
      "native-share",
    ]);
  });

  it("URL payload, canShare=false → pas de Partager natif", () => {
    mockEnv({ canShare: false, clipboardItem: true });
    const options = buildShareOptions({ url: "https://example.com" });
    expect(options.map((o) => o.id)).toEqual(["whatsapp-link", "copy-link"]);
  });

  it("URL payload, navigator.share absent → pas de Partager natif", () => {
    mockEnv({ canShare: null, clipboardItem: true });
    const options = buildShareOptions({ url: "https://example.com" });
    expect(options.map((o) => o.id)).toEqual(["whatsapp-link", "copy-link"]);
  });

  it("Image payload → WhatsApp(image) + Copier image + Télécharger + Partager", () => {
    mockEnv({ canShare: true, clipboardItem: true });
    const blob = new Blob([""], { type: "image/png" });
    const options = buildShareOptions({ imageBlob: blob, imageFileName: "week.png" });
    expect(options.map((o) => o.id)).toEqual([
      "whatsapp-image",
      "copy-image",
      "download-image",
      "native-share",
    ]);
  });

  it("Image payload, ClipboardItem absent → pas de WhatsApp ni Copier image", () => {
    mockEnv({ canShare: true, clipboardItem: false });
    const blob = new Blob([""], { type: "image/png" });
    const options = buildShareOptions({ imageBlob: blob, imageFileName: "week.png" });
    expect(options.map((o) => o.id)).toEqual(["download-image", "native-share"]);
  });

  it("Payload vide → aucune option", () => {
    mockEnv({ canShare: true, clipboardItem: true });
    expect(buildShareOptions({})).toEqual([]);
  });
});
```

**Step 3: Lancer les tests (doivent échouer)**

Run: `npm test -- src/lib/share/__tests__/buildShareOptions.test.ts`
Expected: FAIL — module `../buildShareOptions` introuvable.

**Step 4: Implémenter `buildShareOptions`**

```ts
// src/lib/share/buildShareOptions.ts
import type { SharePayload, ShareOption } from "./types";

function hasNativeShare(payload: SharePayload): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  if (typeof navigator.canShare !== "function") return true;
  const data: ShareData = {};
  if (payload.url) data.url = payload.url;
  if (payload.text) data.text = payload.text;
  if (payload.title) data.title = payload.title;
  if (payload.imageBlob && payload.imageFileName) {
    data.files = [new File([payload.imageBlob], payload.imageFileName, { type: "image/png" })];
  }
  try {
    return navigator.canShare(data);
  } catch {
    return false;
  }
}

function hasClipboardItem(): boolean {
  return typeof ClipboardItem !== "undefined";
}

export function buildShareOptions(payload: SharePayload): ShareOption[] {
  const options: ShareOption[] = [];
  const hasLinkContent = Boolean(payload.url ?? payload.text);
  const hasImage = Boolean(payload.imageBlob);
  const clipboardImageOk = hasImage && hasClipboardItem();

  if (hasLinkContent) options.push({ id: "whatsapp-link", label: "WhatsApp" });
  if (clipboardImageOk) options.push({ id: "whatsapp-image", label: "WhatsApp" });
  if (hasLinkContent) options.push({ id: "copy-link", label: "Copier le lien" });
  if (clipboardImageOk) options.push({ id: "copy-image", label: "Copier l'image" });
  if (hasImage) options.push({ id: "download-image", label: "Télécharger" });
  if (hasNativeShare(payload)) options.push({ id: "native-share", label: "Partager…" });

  return options;
}
```

**Step 5: Relancer les tests (doivent passer)**

Run: `npm test -- src/lib/share/__tests__/buildShareOptions.test.ts`
Expected: PASS — 6 tests verts.

**Step 6: Commit**

```bash
git add src/lib/share/
git commit -m "feat(share): add buildShareOptions pure helper"
```

---

## Task 3: `shareActions` — side-effects

**Files:**
- Create: `src/lib/share/shareActions.ts`
- Create: `src/lib/share/__tests__/shareActions.test.ts`

**Step 1: Écrire les tests**

```ts
// src/lib/share/__tests__/shareActions.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { openWhatsAppLink, openWhatsAppWithImage, copyText, copyImage, downloadImage, nativeShare } from "../shareActions";

describe("shareActions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("openWhatsAppLink → window.open avec wa.me et texte encodé", () => {
    const spy = vi.spyOn(window, "open").mockReturnValue(null);
    openWhatsAppLink("https://eac.app/s/abc?k=1&x=é");
    expect(spy).toHaveBeenCalledWith(
      "https://wa.me/?text=https%3A%2F%2Feac.app%2Fs%2Fabc%3Fk%3D1%26x%3D%C3%A9",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("copyText → clipboard.writeText", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await copyText("hello");
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("copyImage → clipboard.write avec ClipboardItem image/png", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write } });
    const blob = new Blob(["x"], { type: "image/png" });
    await copyImage(blob);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("openWhatsAppWithImage → copyImage puis window.open web.whatsapp.com", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write } });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const blob = new Blob(["x"], { type: "image/png" });
    await openWhatsAppWithImage(blob);
    expect(write).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith("https://web.whatsapp.com", "_blank", "noopener,noreferrer");
  });

  it("nativeShare → navigator.share, AbortError silencieux", async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" }));
    Object.assign(navigator, { share });
    await expect(nativeShare({ url: "u" })).resolves.toBeUndefined();
  });

  it("nativeShare → rejette les autres erreurs", async () => {
    const share = vi.fn().mockRejectedValue(new Error("boom"));
    Object.assign(navigator, { share });
    await expect(nativeShare({ url: "u" })).rejects.toThrow("boom");
  });
});
```

**Step 2: Lancer les tests (doivent échouer)**

Run: `npm test -- src/lib/share/__tests__/shareActions.test.ts`
Expected: FAIL — module introuvable.

**Step 3: Implémenter**

```ts
// src/lib/share/shareActions.ts
import type { SharePayload } from "./types";

export function openWhatsAppLink(url: string): void {
  const wa = `https://wa.me/?text=${encodeURIComponent(url)}`;
  window.open(wa, "_blank", "noopener,noreferrer");
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function copyImage(blob: Blob): Promise<void> {
  const item = new ClipboardItem({ "image/png": blob });
  await navigator.clipboard.write([item]);
}

export async function openWhatsAppWithImage(blob: Blob): Promise<void> {
  await copyImage(blob);
  window.open("https://web.whatsapp.com", "_blank", "noopener,noreferrer");
}

export function downloadImage(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function nativeShare(payload: SharePayload): Promise<void> {
  const data: ShareData = {};
  if (payload.url) data.url = payload.url;
  if (payload.text) data.text = payload.text;
  if (payload.title) data.title = payload.title;
  if (payload.imageBlob && payload.imageFileName) {
    data.files = [new File([payload.imageBlob], payload.imageFileName, { type: "image/png" })];
  }
  try {
    await navigator.share(data);
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return;
    throw err;
  }
}
```

**Step 4: Relancer les tests (doivent passer)**

Run: `npm test -- src/lib/share/__tests__/shareActions.test.ts`
Expected: PASS — 6 tests verts.

**Step 5: Commit**

```bash
git add src/lib/share/shareActions.ts src/lib/share/__tests__/shareActions.test.ts
git commit -m "feat(share): add share action helpers (WhatsApp, clipboard, native, download)"
```

---

## Task 4: `ShareMenu` composant

**Files:**
- Create: `src/components/shared/ShareMenu.tsx`
- Create: `src/components/shared/__tests__/ShareMenu.test.tsx`

**Step 1: Écrire le test**

```tsx
// src/components/shared/__tests__/ShareMenu.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ShareMenu } from "../ShareMenu";

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
    write: vi.fn().mockResolvedValue(undefined),
  },
});
globalThis.ClipboardItem = class {
  constructor(public data: Record<string, Blob>) {}
} as typeof ClipboardItem;

// Mock toast
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe("ShareMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("affiche WhatsApp + Copier pour un payload URL", async () => {
    render(<ShareMenu payload={{ url: "https://example.com" }} trigger={<button>Partager</button>} />);
    fireEvent.click(screen.getByText("Partager"));
    await waitFor(() => expect(screen.getByText("WhatsApp")).toBeInTheDocument());
    expect(screen.getByText("Copier le lien")).toBeInTheDocument();
  });

  it("clic WhatsApp → window.open wa.me", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ShareMenu payload={{ url: "https://x.com" }} trigger={<button>T</button>} />);
    fireEvent.click(screen.getByText("T"));
    await waitFor(() => screen.getByText("WhatsApp"));
    fireEvent.click(screen.getByText("WhatsApp"));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/wa\.me/), "_blank", expect.any(String));
  });

  it("clic Copier le lien → clipboard.writeText", async () => {
    render(<ShareMenu payload={{ url: "https://x.com" }} trigger={<button>T</button>} />);
    fireEvent.click(screen.getByText("T"));
    await waitFor(() => screen.getByText("Copier le lien"));
    fireEvent.click(screen.getByText("Copier le lien"));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://x.com"));
  });

  it("onOpen async résolu avant ouverture du menu", async () => {
    const onOpen = vi.fn().mockResolvedValue({ url: "https://lazy.com" });
    render(<ShareMenu onOpen={onOpen} trigger={<button>T</button>} />);
    fireEvent.click(screen.getByText("T"));
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("WhatsApp")).toBeInTheDocument());
  });
});
```

**Step 2: Lancer le test (doit échouer)**

Run: `npm test -- src/components/shared/__tests__/ShareMenu.test.tsx`
Expected: FAIL — module introuvable.

**Step 3: Implémenter le composant**

```tsx
// src/components/shared/ShareMenu.tsx
import { type ReactNode, useCallback, useState } from "react";
import { Copy, Download, Share2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { WhatsAppIcon } from "@/components/shared/icons/WhatsAppIcon";
import { buildShareOptions } from "@/lib/share/buildShareOptions";
import type { SharePayload, ShareOptionId } from "@/lib/share/types";
import {
  copyImage,
  copyText,
  downloadImage,
  nativeShare,
  openWhatsAppLink,
  openWhatsAppWithImage,
} from "@/lib/share/shareActions";

type Props = {
  trigger: ReactNode;
  payload?: SharePayload;
  onOpen?: () => Promise<SharePayload>;
};

const ICONS: Record<ShareOptionId, ReactNode> = {
  "whatsapp-link": <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />,
  "whatsapp-image": <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />,
  "copy-link": <Copy className="h-4 w-4" />,
  "copy-image": <Copy className="h-4 w-4" />,
  "download-image": <Download className="h-4 w-4" />,
  "native-share": <Share2 className="h-4 w-4" />,
};

export function ShareMenu({ trigger, payload, onOpen }: Props) {
  const { toast } = useToast();
  const [resolvedPayload, setResolvedPayload] = useState<SharePayload | null>(payload ?? null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    async (next: boolean) => {
      if (next && onOpen) {
        setLoading(true);
        try {
          const p = await onOpen();
          setResolvedPayload(p);
          setOpen(true);
        } catch {
          toast({
            title: "Erreur",
            description: "Impossible de préparer le partage.",
            variant: "destructive",
          });
        } finally {
          setLoading(false);
        }
        return;
      }
      if (next && payload) setResolvedPayload(payload);
      setOpen(next);
    },
    [onOpen, payload, toast],
  );

  const run = useCallback(
    async (id: ShareOptionId) => {
      if (!resolvedPayload) return;
      try {
        switch (id) {
          case "whatsapp-link":
            openWhatsAppLink(resolvedPayload.url ?? resolvedPayload.text ?? "");
            break;
          case "whatsapp-image":
            if (!resolvedPayload.imageBlob) return;
            await openWhatsAppWithImage(resolvedPayload.imageBlob);
            toast({
              title: "Image copiée",
              description: "Collez dans la conversation (⌘+V).",
            });
            break;
          case "copy-link":
            await copyText(resolvedPayload.url ?? resolvedPayload.text ?? "");
            toast({ title: "Lien copié !" });
            break;
          case "copy-image":
            if (!resolvedPayload.imageBlob) return;
            await copyImage(resolvedPayload.imageBlob);
            toast({ title: "Image copiée !" });
            break;
          case "download-image":
            if (!resolvedPayload.imageBlob || !resolvedPayload.imageFileName) return;
            downloadImage(resolvedPayload.imageBlob, resolvedPayload.imageFileName);
            break;
          case "native-share":
            await nativeShare(resolvedPayload);
            break;
        }
      } catch (err) {
        toast({
          title: "Erreur",
          description: (err as Error)?.message ?? "Partage impossible.",
          variant: "destructive",
        });
      }
    },
    [resolvedPayload, toast],
  );

  const options = resolvedPayload ? buildShareOptions(resolvedPayload) : [];

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild disabled={loading}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {options.map((opt) => (
          <DropdownMenuItem key={opt.id} onClick={() => run(opt.id)}>
            {ICONS[opt.id]}
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

**Step 4: Relancer le test**

Run: `npm test -- src/components/shared/__tests__/ShareMenu.test.tsx`
Expected: PASS — 4 tests verts.

**Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: aucune erreur nouvelle sur les fichiers créés.

**Step 6: Commit**

```bash
git add src/components/shared/ShareMenu.tsx src/components/shared/__tests__/ShareMenu.test.tsx
git commit -m "feat(share): add ShareMenu component with lazy payload resolution"
```

---

## Task 5: Intégrer `SlotSessionSheet`

**Files:**
- Modify: `src/pages/coach/SlotSessionSheet.tsx`

**Step 1: Remplacer `handleShare` et le bouton**

Dans `SlotSessionSheet.tsx` :

1. Supprimer l'import de `Share2` si plus utilisé **à l'intérieur du fichier** (grep d'abord — il sert peut-être ailleurs dans le sheet).
2. Supprimer la déclaration `const handleShare = useCallback(async () => { ... }, [...])` (lignes 279-309).
3. Supprimer le state `isSharing` si exclusivement utilisé par `handleShare`.
4. Remplacer le bouton (lignes ~349-362) par :

```tsx
{assignment?.swim_catalog_id != null && (
  <ShareMenu
    onOpen={async () => {
      const token = await generateShareToken(assignment.swim_catalog_id!);
      const url = `${window.location.origin}${window.location.pathname}#/s/${token}`;
      return { url, title: assignment?.session_name ?? "Séance" };
    }}
    trigger={
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/50 text-muted-foreground active:scale-95 transition-transform disabled:opacity-50"
        aria-label="Partager la séance"
      >
        <Share2 className="h-4 w-4" />
      </button>
    }
  />
)}
```

5. Ajouter en haut du fichier : `import { ShareMenu } from "@/components/shared/ShareMenu";`

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

**Step 3: Test manuel**

1. `npm run dev`
2. Se connecter en coach, aller sur `/coach/creneaux`, ouvrir un créneau avec une séance assignée, cliquer "Aperçu".
3. Cliquer sur l'icône partage en haut à droite.
4. Vérifier menu s'affiche avec 3 options : WhatsApp / Copier le lien / Partager…
5. Cliquer WhatsApp → nouvel onglet wa.me avec URL préremplie.
6. Cliquer Copier → toast "Lien copié !" + coller dans un éditeur → URL de type `/#/s/<uuid>`.

**Step 4: Commit**

```bash
git add src/pages/coach/SlotSessionSheet.tsx
git commit -m "feat(share): migrate SlotSessionSheet to ShareMenu"
```

---

## Task 6: Intégrer `SwimSessionView`

**Files:**
- Modify: `src/pages/SwimSessionView.tsx`

**Step 1: Remplacer `handleShare` et le bouton**

1. Supprimer `handleShare` (lignes 269-280).
2. Remplacer le bouton (lignes 317-319) par :

```tsx
<ShareMenu
  payload={{ url: window.location.href, title: assignment.title }}
  trigger={
    <Button variant="ghost" size="icon" aria-label="Partager la séance">
      <Share2 className="h-5 w-5" />
    </Button>
  }
/>
```

3. Ajouter l'import `ShareMenu`.

**Step 2: Type check + test manuel**

Run: `npx tsc --noEmit`

Manuel : ouvrir une séance nageur, cliquer partage, vérifier menu.

**Step 3: Commit**

```bash
git add src/pages/SwimSessionView.tsx
git commit -m "feat(share): migrate SwimSessionView to ShareMenu"
```

---

## Task 7: Intégrer `SwimCatalog` via sous-menu

**Files:**
- Modify: `src/components/coach/shared/SessionListView.tsx`
- Modify: `src/pages/coach/SwimCatalog.tsx`

**Step 1: Décision de design**

`SessionListView` rend déjà un `DropdownMenu` par session, avec un item "Partager" qui appelle `onShare(session)`. Pour éviter un double menu (menu actions → sous-menu partage), on **remplace** l'item "Partager" par un `<ShareMenu>` imbriqué. Radix ne supporte pas `DropdownMenuSub` en trigger enfant direct propre → on utilise la composition `DropdownMenuSub` officielle.

**Step 2: Modifier `SessionListView` signature**

Remplacer la prop `onShare?: (session: T) => void` par `buildSharePayload?: (session: T) => Promise<SharePayload>`.

```tsx
// src/components/coach/shared/SessionListView.tsx
// Imports à ajouter :
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareMenu } from "@/components/shared/ShareMenu";
import type { SharePayload } from "@/lib/share/types";
```

Dans l'interface des props :

```tsx
buildSharePayload?: (session: T) => Promise<SharePayload>;
```

Remplacer le bloc `{onShare && ( ... )}` par une version qui rend les options partage inline (WhatsApp + Copier) dans le même dropdown :

```tsx
{buildSharePayload && (
  <DropdownMenuSub>
    <DropdownMenuSubTrigger>
      <Share2 className="h-4 w-4" />
      Partager
    </DropdownMenuSubTrigger>
    <DropdownMenuSubContent>
      <ShareMenuInline
        onOpen={() => buildSharePayload(session)}
      />
    </DropdownMenuSubContent>
  </DropdownMenuSub>
)}
```

**Step 3: Extraire `ShareMenuInline`**

Le dropdown parent est déjà ouvert → on ne peut pas imbriquer un second `DropdownMenu`. On ajoute un export `ShareMenuInline` dans `ShareMenu.tsx` qui rend **uniquement les items** (sans `<DropdownMenu>` wrapper), destiné à être monté dans un `DropdownMenuSubContent` :

```tsx
// Ajouter dans src/components/shared/ShareMenu.tsx
export function ShareMenuInline({ onOpen, payload }: { onOpen?: () => Promise<SharePayload>; payload?: SharePayload }) {
  const { toast } = useToast();
  const [resolved, setResolved] = useState<SharePayload | null>(payload ?? null);

  useEffect(() => {
    if (!onOpen || resolved) return;
    onOpen()
      .then(setResolved)
      .catch(() => toast({ title: "Erreur", description: "Impossible de préparer le partage.", variant: "destructive" }));
  }, [onOpen, resolved, toast]);

  const run = /* même logique que dans ShareMenu — à extraire dans useShareActions hook si partage */;
  const options = resolved ? buildShareOptions(resolved) : [];

  if (!resolved) return <DropdownMenuItem disabled>Chargement…</DropdownMenuItem>;
  return (
    <>
      {options.map((opt) => (
        <DropdownMenuItem key={opt.id} onClick={() => run(opt.id)}>
          {ICONS[opt.id]}
          {opt.label}
        </DropdownMenuItem>
      ))}
    </>
  );
}
```

Refactor : extraire la logique `run` dans un hook `useShareActions(payload)` utilisé par `ShareMenu` ET `ShareMenuInline`. Ajouter `useEffect` import.

**Step 4: Modifier `SwimCatalog.tsx`**

Remplacer `handleShare` et la prop `onShare={...}` par :

```tsx
buildSharePayload={async (session: SwimSessionTemplate) => {
  const token = await generateShareToken(session.id);
  const url = `${window.location.origin}${window.location.pathname}#/s/${token}`;
  return { url, title: session.name };
}}
```

Supprimer l'ancien `handleShare` (lignes 569-580).

**Step 5: Type check + tests**

```
npx tsc --noEmit
npm test -- src/components/shared/__tests__/ShareMenu.test.tsx
```

**Step 6: Test manuel**

Ouvrir `/coach/bibliotheque`, cliquer menu actions d'une séance → sous-menu "Partager" → options visibles → WhatsApp fonctionne.

**Step 7: Commit**

```bash
git add src/components/shared/ShareMenu.tsx src/components/coach/shared/SessionListView.tsx src/pages/coach/SwimCatalog.tsx
git commit -m "feat(share): migrate SwimCatalog to ShareMenu via DropdownMenuSub"
```

---

## Task 8: Intégrer `CoachTrainingSlotsScreen` (image)

**Files:**
- Modify: `src/pages/coach/CoachTrainingSlotsScreen.tsx`

**Step 1: Remplacer `shareOrDownloadPng` et les boutons**

1. Supprimer `shareOrDownloadPng` (lignes 2151-2171) — sa logique est désormais dans `ShareMenu` + `shareActions`.
2. Identifier les 2 boutons qui l'appellent (lignes ~2596 et ~2681).
3. Pour chaque bouton, remplacer par :

```tsx
<ShareMenu
  onOpen={async () => {
    setExporting(true);
    try {
      const blob = await buildFallbackWeekPng();
      const fileName = `creneaux-semaine-${weekStartLabel}.png`;
      return { imageBlob: blob, imageFileName: fileName, title: "Créneaux semaine" };
    } finally {
      setExporting(false);
    }
  }}
  trigger={
    <Button variant="outline" size="sm" disabled={exporting}>
      {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
      Partager
    </Button>
  }
/>
```

(Adapter le wrapper button au style existant de chaque call site — cf. `className` d'origine ligne 2596 et 2681.)

4. Ajouter import `ShareMenu`.

**Step 2: Type check + test manuel**

```
npx tsc --noEmit
npm run dev
```

Sur `/coach/creneaux` semaine, cliquer partage → menu : WhatsApp / Copier l'image / Télécharger / Partager…
- WhatsApp → toast "Image copiée" + onglet web.whatsapp.com.
- Copier l'image → toast, coller dans un éditeur d'image → OK.
- Télécharger → fichier PNG téléchargé.

**Step 3: Commit**

```bash
git add src/pages/coach/CoachTrainingSlotsScreen.tsx
git commit -m "feat(share): migrate CoachTrainingSlotsScreen (week PNG) to ShareMenu"
```

---

## Task 9: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/implementation-log.md`
- Modify: `docs/ROADMAP.md`

**Step 1: Mesurer les tailles finales**

```bash
wc -l src/lib/share/*.ts src/components/shared/ShareMenu.tsx src/components/shared/icons/WhatsAppIcon.tsx
```

**Step 2: Mettre à jour `CLAUDE.md`**

Ajouter au tableau "Fichiers clés" (après une ligne existante dans `src/components/shared/`) :

```
| `src/lib/share/buildShareOptions.ts` | Helpers purs options partage (URL vs image, capacités nav) | ~N lignes |
| `src/lib/share/shareActions.ts` | Side-effects partage (WhatsApp, clipboard, native, download) | ~N lignes |
| `src/lib/share/types.ts` | Types SharePayload, ShareOption | ~N lignes |
| `src/components/shared/ShareMenu.tsx` | Dropdown partage unifié (WhatsApp + Copier + Partager natif) (§128) | ~N lignes |
| `src/components/shared/icons/WhatsAppIcon.tsx` | Icône WhatsApp SVG inline (#25D366) | ~N lignes |
```

Ajouter au tableau "Chantiers futurs" une ligne :

```
| 92 | Menu partage unifié WhatsApp + Clipboard (coach macOS) | Moyenne | Fait (§128) |
```

**Step 3: Ajouter `docs/implementation-log.md` §128**

Structure habituelle : Contexte, Changements, Fichiers modifiés/créés, Tests, Décisions, Limites.

**Step 4: Ajouter `docs/ROADMAP.md`**

Ajouter entrée "Fait" avec lien vers §128, et mettre à jour la ligne `*Dernière mise à jour*` en tête de fichier.

**Step 5: Commit final**

```bash
git add CLAUDE.md docs/implementation-log.md docs/ROADMAP.md
git commit -m "docs: log §128 share menu WhatsApp + clipboard unification"
```

---

## Validation finale

**Avant de clore :**

```bash
npm test                  # toute la suite passe
npx tsc --noEmit         # aucune erreur TS nouvelle
npm run build            # build production OK
```

**Smoke test final (dev server)** — 4 points de partage fonctionnent :
1. `SlotSessionSheet` (preview créneau coach) — menu 3 options URL.
2. `SwimSessionView` (page séance nageur) — menu 3 options URL.
3. `SwimCatalog` (catalogue coach, sous-menu) — menu inline dans dropdown actions.
4. `CoachTrainingSlotsScreen` (image semaine) — menu 4 options image.

Pour chaque : WhatsApp ouvre nouvel onglet, Copier affiche toast, Partager natif (si dispo) ouvre feuille système.

---

## Notes d'exécution

- **Un seul chantier, 4 intégrations** — tester manuellement entre chaque Task 5–8 pour isoler les régressions.
- **Ne pas sauter la génération de token lazy** (via `onOpen`) — crée un token par clic, pas par mount (l'ancien code le faisait déjà au mount dans certains cas, c'est un léger gain).
- **Navigateurs** : tester en priorité Chrome macOS (cible coach), puis Safari macOS + Safari iOS. Firefox : l'option WhatsApp image doit être absente, vérifier que les autres options marchent.
- **Si `ClipboardItem` n'est pas dispo** dans l'environnement de test Vitest (jsdom), polyfiller dans le setup global ou mocker par test comme dans le fichier de test `buildShareOptions`.
