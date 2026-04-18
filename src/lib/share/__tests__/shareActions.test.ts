import assert from "node:assert/strict";
import { mock, test } from "node:test";

import {
  copyImage,
  copyText,
  nativeShare,
  openWhatsAppLink,
  openWhatsAppWithImage,
} from "../shareActions";

type Restorer = () => void;

function defineGlobal<K extends PropertyKey>(key: K, value: unknown): Restorer {
  const orig = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
  return () => {
    if (orig) {
      Object.defineProperty(globalThis, key, orig);
    } else {
      // @ts-expect-error — cleanup
      delete globalThis[key];
    }
  };
}

// Minimal ClipboardItem polyfill that captures constructor input for inspection.
class FakeClipboardItem {
  public data: Record<string, Blob>;
  constructor(data: Record<string, Blob>) {
    this.data = data;
  }
}

test("openWhatsAppLink — calls window.open with encoded wa.me URL, _blank, noopener,noreferrer", () => {
  const openSpy = mock.fn();
  const restoreWindow = defineGlobal("window", { open: openSpy });
  try {
    openWhatsAppLink("https://eac.app/s/abc?k=1&x=é");
    assert.strictEqual(openSpy.mock.callCount(), 1);
    const [urlArg, targetArg, featuresArg] = openSpy.mock.calls[0].arguments;
    assert.strictEqual(
      urlArg,
      "https://wa.me/?text=https%3A%2F%2Feac.app%2Fs%2Fabc%3Fk%3D1%26x%3D%C3%A9",
    );
    assert.strictEqual(targetArg, "_blank");
    assert.strictEqual(featuresArg, "noopener,noreferrer");
  } finally {
    restoreWindow();
  }
});

test("copyText — calls navigator.clipboard.writeText once with the provided text", async () => {
  const writeTextSpy = mock.fn(() => Promise.resolve());
  const restoreNav = defineGlobal("navigator", {
    clipboard: { writeText: writeTextSpy },
  });
  try {
    await copyText("hello");
    assert.strictEqual(writeTextSpy.mock.callCount(), 1);
    assert.deepStrictEqual(writeTextSpy.mock.calls[0].arguments, ["hello"]);
  } finally {
    restoreNav();
  }
});

test("copyImage — constructs ClipboardItem({'image/png': blob}) and passes [item] to navigator.clipboard.write", async () => {
  const writeSpy = mock.fn(() => Promise.resolve());
  const restoreNav = defineGlobal("navigator", {
    clipboard: { write: writeSpy },
  });
  const restoreCI = defineGlobal("ClipboardItem", FakeClipboardItem);
  try {
    const blob = new Blob(["x"], { type: "image/png" });
    await copyImage(blob);
    assert.strictEqual(writeSpy.mock.callCount(), 1);
    const [items] = writeSpy.mock.calls[0].arguments as [FakeClipboardItem[]];
    assert.ok(Array.isArray(items));
    assert.strictEqual(items.length, 1);
    assert.ok(items[0] instanceof FakeClipboardItem);
    assert.strictEqual(items[0].data["image/png"], blob);
  } finally {
    restoreCI();
    restoreNav();
  }
});

test("openWhatsAppWithImage — calls navigator.clipboard.write AND window.open(https://web.whatsapp.com, ...)", async () => {
  const writeSpy = mock.fn(() => Promise.resolve());
  const openSpy = mock.fn();
  const restoreNav = defineGlobal("navigator", {
    clipboard: { write: writeSpy },
  });
  const restoreCI = defineGlobal("ClipboardItem", FakeClipboardItem);
  const restoreWindow = defineGlobal("window", { open: openSpy });
  try {
    const blob = new Blob(["x"], { type: "image/png" });
    await openWhatsAppWithImage(blob);
    assert.strictEqual(writeSpy.mock.callCount(), 1);
    assert.strictEqual(openSpy.mock.callCount(), 1);
    const [urlArg, targetArg, featuresArg] = openSpy.mock.calls[0].arguments;
    assert.strictEqual(urlArg, "https://web.whatsapp.com");
    assert.strictEqual(targetArg, "_blank");
    assert.strictEqual(featuresArg, "noopener,noreferrer");
  } finally {
    restoreWindow();
    restoreCI();
    restoreNav();
  }
});

test("nativeShare — swallows AbortError from navigator.share", async () => {
  const abortErr = Object.assign(new Error("user aborted"), { name: "AbortError" });
  const shareSpy = mock.fn(() => Promise.reject(abortErr));
  const restoreNav = defineGlobal("navigator", { share: shareSpy });
  try {
    await assert.doesNotReject(() => nativeShare({ url: "https://x" }));
    assert.strictEqual(shareSpy.mock.callCount(), 1);
  } finally {
    restoreNav();
  }
});

test("nativeShare — rethrows non-AbortError from navigator.share", async () => {
  const shareSpy = mock.fn(() => Promise.reject(new Error("boom")));
  const restoreNav = defineGlobal("navigator", { share: shareSpy });
  try {
    await assert.rejects(
      () => nativeShare({ url: "https://x" }),
      (err: Error) => err.message === "boom",
    );
    assert.strictEqual(shareSpy.mock.callCount(), 1);
  } finally {
    restoreNav();
  }
});
