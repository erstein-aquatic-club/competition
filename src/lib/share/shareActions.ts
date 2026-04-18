import type { SharePayload } from "./types";

// Invoque un scheme URL (ex: whatsapp://) via un click programmatique sur <a>.
// Contrairement à window.open, ça préserve l'onglet courant et déclenche le
// handler OS (WhatsApp Desktop) sans ouvrir de tab intermédiaire.
export function triggerUrlScheme(href: string): void {
  const a = document.createElement("a");
  a.href = href;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function openWhatsAppLink(url: string): void {
  // Copie aussi dans le clipboard comme filet de sécurité : certaines versions
  // de WhatsApp Desktop ignorent silencieusement le paramètre text du scheme,
  // l'utilisateur peut alors coller manuellement (⌘+V).
  void navigator.clipboard.writeText(url).catch(() => {
    // Silent — le clipboard peut échouer (permissions Safari strict), on ne bloque pas l'ouverture de WA.
  });
  triggerUrlScheme(`whatsapp://send?text=${encodeURIComponent(url)}`);
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
  // "whatsapp://send" a de meilleures chances d'ouvrir le picker "nouveau chat"
  // sur les versions récentes de WhatsApp Desktop que "whatsapp://" seul.
  triggerUrlScheme("whatsapp://send");
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
