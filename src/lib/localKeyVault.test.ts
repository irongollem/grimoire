import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto"; // provides indexedDB; happy-dom already supplies crypto.subtle

import {
  isLocalCiphertext,
  encryptLocalKey,
  decryptLocalKey,
} from "@/lib/localKeyVault";

describe("localKeyVault", () => {
  beforeEach(() => {
    // Fresh IndexedDB per test so the generated key doesn't leak between cases.
    indexedDB.deleteDatabase("grimoire-keyvault");
  });

  it("detects local-vault ciphertext by prefix", () => {
    expect(isLocalCiphertext("lck:v1:abc:def")).toBe(true);
    expect(isLocalCiphertext("sk-plaintext")).toBe(false);
    expect(isLocalCiphertext("enc:v1:abc:def")).toBe(false);
    expect(isLocalCiphertext("")).toBe(false);
    expect(isLocalCiphertext(null)).toBe(false);
  });

  it("round-trips a key through encrypt/decrypt", async () => {
    const plain = "sk-test-1234567890";
    const enc = await encryptLocalKey(plain);
    expect(enc.startsWith("lck:v1:")).toBe(true);
    expect(enc).not.toContain(plain); // ciphertext must not leak the plaintext
    expect(await decryptLocalKey(enc)).toBe(plain);
  });

  it("produces a fresh IV each call (different ciphertext, same plaintext)", async () => {
    const a = await encryptLocalKey("sk-same");
    const b = await encryptLocalKey("sk-same");
    expect(a).not.toBe(b);
    expect(await decryptLocalKey(a)).toBe("sk-same");
    expect(await decryptLocalKey(b)).toBe("sk-same");
  });

  it("returns empty for an empty plaintext and passes through non-ciphertext", async () => {
    expect(await encryptLocalKey("")).toBe("");
    // Legacy plaintext / server enc:v1: values are returned unchanged by decrypt.
    expect(await decryptLocalKey("sk-legacy-plaintext")).toBe("sk-legacy-plaintext");
    expect(await decryptLocalKey("enc:v1:foo:bar")).toBe("enc:v1:foo:bar");
  });

  it("fails to decrypt a tampered ciphertext", async () => {
    const enc = await encryptLocalKey("sk-secret");
    const [, , iv] = enc.split(":");
    const tampered = `lck:v1:${iv}:${btoa("garbage-ciphertext")}`;
    await expect(decryptLocalKey(tampered)).rejects.toBeTruthy();
  });
});
