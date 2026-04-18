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
