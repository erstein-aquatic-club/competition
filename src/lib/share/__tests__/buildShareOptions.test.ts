import { describe, it, expect, vi, afterEach } from "vitest";
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
