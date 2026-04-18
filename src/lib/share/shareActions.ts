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
