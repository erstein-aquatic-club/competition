import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { urlBase64ToUint8Array, serializeSubscription } from "@/lib/pushHelpers";

describe("pushHelpers", () => {
  it("urlBase64ToUint8Array converts base64url to Uint8Array", () => {
    const result = urlBase64ToUint8Array("AQAB");
    assert.ok(result instanceof Uint8Array);
    assert.equal(result.length, 3);
    assert.equal(result[0], 1);
    assert.equal(result[1], 0);
    assert.equal(result[2], 1);
  });

  it("serializeSubscription extracts endpoint and keys", () => {
    const mockSub = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      toJSON: () => ({
        endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
        keys: { p256dh: "pubkey123", auth: "authkey456" },
      }),
    };
    const result = serializeSubscription(mockSub as any);
    assert.equal(result.endpoint, "https://fcm.googleapis.com/fcm/send/abc123");
    assert.equal(result.p256dh, "pubkey123");
    assert.equal(result.auth, "authkey456");
  });
});
