/**
 * Local-only API key vault.
 *
 * For the "BYOK local" tier — the user stores their own provider key and it
 * NEVER reaches our servers. We can't use the server `apiKeyVault` (that would
 * route the plaintext through our edge function), so encryption happens fully
 * in the browser with a key we never see.
 *
 * The encryption key is a non-extractable AES-GCM `CryptoKey` held in
 * IndexedDB: the browser will let JS *use* it but `crypto.subtle.exportKey()`
 * throws, so the raw key bytes can never be read out — not by our code, not by
 * an attacker who dumps localStorage/IndexedDB strings. The provider key is
 * stored only as `lck:v1:<iv>:<ciphertext>` in localStorage.
 *
 * Threat model (be honest about it):
 *   - Protects against: localStorage/IndexedDB string exfiltration, at-rest
 *     profile/backup reads, post-logout residue, storage-reading extensions.
 *   - Does NOT protect against: active XSS while the app is open (the key has
 *     to be usable on the origin, so injected code can ask it to decrypt or
 *     read the plaintext from memory at use-time). CSP is the control there.
 *   - Not synced across devices — there is nothing on our side to sync. That's
 *     the literal meaning of "we never receive it".
 */

const DB_NAME = "grimoire-keyvault";
const STORE_NAME = "keys";
const CRYPTO_KEY_ID = "local-aes-key";
const PREFIX = "lck:v1:";

function browserCryptoAvailable(): boolean {
  return (
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined"
  );
}

/** True if a stored value is local-vault ciphertext (vs plaintext or server `enc:v1:`). */
export function isLocalCiphertext(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB get failed"));
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB put failed"));
  });
}

// One in-flight key promise, so concurrent callers (loadProviderKeys fires one
// per provider) don't race to generate competing keys.
let keyPromise: Promise<CryptoKey> | null = null;

function getOrCreateKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    const db = await openDb();
    const existing = await idbGet<CryptoKey>(db, CRYPTO_KEY_ID);
    if (existing) return existing;
    const key = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false, // non-extractable — the whole point
      ["encrypt", "decrypt"],
    );
    await idbPut(db, CRYPTO_KEY_ID, key);
    return key;
  })().catch((e) => {
    keyPromise = null; // allow retry on a transient failure
    throw e;
  });
  return keyPromise;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// Return type is intentionally inferred (not annotated `Uint8Array`): a bare
// `Uint8Array` annotation widens to `Uint8Array<ArrayBufferLike>`, which newer
// lib.dom typings reject as a WebCrypto `BufferSource`. A freshly-allocated
// array is `ArrayBuffer`-backed, which is what `crypto.subtle.*` wants.
function fromBase64(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Encrypt a plaintext API key for at-rest local storage. Returns `lck:v1:<iv>:<ct>`. */
export async function encryptLocalKey(plaintext: string): Promise<string> {
  if (!plaintext) return "";
  if (!browserCryptoAvailable()) {
    throw new Error("Local key vault unavailable (no WebCrypto/IndexedDB)");
  }
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  // Re-wrap in a fresh Uint8Array so the encoded bytes are ArrayBuffer-backed
  // (TextEncoder().encode() is typed ArrayBufferLike, rejected by WebCrypto).
  const data = new Uint8Array(new TextEncoder().encode(plaintext));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return `${PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ct))}`;
}

/**
 * Decrypt a local-vault value. Non-`lck:v1:` values are returned unchanged
 * (legacy plaintext passthrough); callers handle server `enc:v1:` separately.
 */
export async function decryptLocalKey(value: string): Promise<string> {
  if (!value || !isLocalCiphertext(value)) return value ?? "";
  if (!browserCryptoAvailable()) {
    throw new Error("Local key vault unavailable (no WebCrypto/IndexedDB)");
  }
  const parts = value.split(":");
  if (parts.length !== 4) throw new Error("Invalid local key format");
  const [, , ivB64, ctB64] = parts;
  const key = await getOrCreateKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) },
    key,
    fromBase64(ctB64),
  );
  return new TextDecoder().decode(plain);
}
