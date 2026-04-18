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
