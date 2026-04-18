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

type FakeAnchor = { href: string; click: ReturnType<typeof mock.fn> };

function mockDocumentWithAnchor(): {
  fakeAnchor: FakeAnchor;
  createElementSpy: ReturnType<typeof mock.fn>;
  restore: Restorer;
} {
  const fakeAnchor: FakeAnchor = { href: "", click: mock.fn() };
  const createElementSpy = mock.fn((tag: string) =>
    tag === "a" ? fakeAnchor : ({} as unknown),
  );
  const restore = defineGlobal("document", {
    createElement: createElementSpy,
    body: { appendChild: mock.fn(), removeChild: mock.fn() },
  });
  return { fakeAnchor, createElementSpy, restore };
}

test("openWhatsAppLink — triggers whatsapp:// scheme via anchor click with encoded text", () => {
  const { fakeAnchor, createElementSpy, restore } = mockDocumentWithAnchor();
  try {
    openWhatsAppLink("https://eac.app/s/abc?k=1&x=é");
    assert.strictEqual(createElementSpy.mock.callCount(), 1);
    assert.strictEqual(createElementSpy.mock.calls[0].arguments[0], "a");
    assert.strictEqual(
      fakeAnchor.href,
      "whatsapp://send?text=https%3A%2F%2Feac.app%2Fs%2Fabc%3Fk%3D1%26x%3D%C3%A9",
    );
    assert.strictEqual(fakeAnchor.click.mock.callCount(), 1);
  } finally {
    restore();
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

test("openWhatsAppWithImage — copies image then triggers whatsapp:// scheme via anchor click", async () => {
  const writeSpy = mock.fn(() => Promise.resolve());
  const restoreNav = defineGlobal("navigator", {
    clipboard: { write: writeSpy },
  });
  const restoreCI = defineGlobal("ClipboardItem", FakeClipboardItem);
  const { fakeAnchor, restore: restoreDoc } = mockDocumentWithAnchor();
  try {
    const blob = new Blob(["x"], { type: "image/png" });
    await openWhatsAppWithImage(blob);
    assert.strictEqual(writeSpy.mock.callCount(), 1);
    assert.strictEqual(fakeAnchor.href, "whatsapp://");
    assert.strictEqual(fakeAnchor.click.mock.callCount(), 1);
  } finally {
    restoreDoc();
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
