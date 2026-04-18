import assert from "node:assert/strict";
import { test } from "node:test";

import { buildShareOptions } from "../buildShareOptions";

function defineNavigator(value: Navigator | undefined): void {
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
    writable: true,
  });
}

function withMockedEnv<T>(
  opts: { canShare: "yes" | "no" | "absent"; clipboardItem: boolean },
  fn: () => T,
): T {
  const origNavDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const origCI = globalThis.ClipboardItem;

  const nav: Partial<Navigator> = {};
  if (opts.canShare === "yes") {
    nav.share = (() => Promise.resolve()) as Navigator["share"];
    nav.canShare = (() => true) as Navigator["canShare"];
  } else if (opts.canShare === "no") {
    nav.share = (() => Promise.resolve()) as Navigator["share"];
    nav.canShare = (() => false) as Navigator["canShare"];
  }
  // "absent" → navigator.share stays undefined

  defineNavigator(nav as Navigator);

  if (opts.clipboardItem) {
    globalThis.ClipboardItem = class {} as typeof ClipboardItem;
  } else {
    // @ts-expect-error — test mutation
    delete globalThis.ClipboardItem;
  }

  try {
    return fn();
  } finally {
    if (origNavDescriptor) {
      Object.defineProperty(globalThis, "navigator", origNavDescriptor);
    } else {
      // @ts-expect-error — restore
      delete globalThis.navigator;
    }
    globalThis.ClipboardItem = origCI;
  }
}

test("buildShareOptions — URL payload + canShare=true + ClipboardItem → whatsapp-link + copy-link + native-share", () => {
  withMockedEnv({ canShare: "yes", clipboardItem: true }, () => {
    const options = buildShareOptions({ url: "https://example.com", title: "t" });
    assert.deepStrictEqual(
      options.map((o) => o.id),
      ["whatsapp-link", "copy-link", "native-share"],
    );
  });
});

test("buildShareOptions — URL payload + canShare=false → no native-share", () => {
  withMockedEnv({ canShare: "no", clipboardItem: true }, () => {
    const options = buildShareOptions({ url: "https://example.com" });
    assert.deepStrictEqual(
      options.map((o) => o.id),
      ["whatsapp-link", "copy-link"],
    );
  });
});

test("buildShareOptions — URL payload + navigator.share absent → no native-share", () => {
  withMockedEnv({ canShare: "absent", clipboardItem: true }, () => {
    const options = buildShareOptions({ url: "https://example.com" });
    assert.deepStrictEqual(
      options.map((o) => o.id),
      ["whatsapp-link", "copy-link"],
    );
  });
});

test("buildShareOptions — Image payload + canShare=true + ClipboardItem → whatsapp-image + copy-image + download-image + native-share", () => {
  withMockedEnv({ canShare: "yes", clipboardItem: true }, () => {
    const blob = new Blob([""], { type: "image/png" });
    const options = buildShareOptions({ imageBlob: blob, imageFileName: "week.png" });
    assert.deepStrictEqual(
      options.map((o) => o.id),
      ["whatsapp-image", "copy-image", "download-image", "native-share"],
    );
  });
});

test("buildShareOptions — Image payload + ClipboardItem absent → no whatsapp-image nor copy-image", () => {
  withMockedEnv({ canShare: "yes", clipboardItem: false }, () => {
    const blob = new Blob([""], { type: "image/png" });
    const options = buildShareOptions({ imageBlob: blob, imageFileName: "week.png" });
    assert.deepStrictEqual(
      options.map((o) => o.id),
      ["download-image", "native-share"],
    );
  });
});

test("buildShareOptions — empty payload → no options", () => {
  // When there is no content to share, native share should also be absent.
  // Using canShare="absent" models the realistic case (no URL/text/blob → nothing to invoke share with).
  withMockedEnv({ canShare: "absent", clipboardItem: true }, () => {
    assert.deepStrictEqual(buildShareOptions({}), []);
  });
});
