import { describe, it, expect } from "vitest";
import { AuthClient, createClient, type Session } from "@supabase/supabase-js";
import { authStorageKey, readPersistedSession } from "@/lib/persistedSession";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

const session: Session = {
  access_token: "expired-access-token",
  refresh_token: "still-good-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) - 600,
  user: {
    id: "4c0ffee0-0000-4000-8000-000000000001",
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  },
};

describe("authStorageKey", () => {
  // Our explicit key must be the one supabase-js would have chosen: a different
  // one would sign every user out once, their session being under the old key.
  it.each(["https://abcdefghijklmnop.supabase.co", "http://127.0.0.1:54321"])(
    "matches the key supabase-js derives for %s",
    (url) => {
      const client = createClient(url, "anon-key", {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      expect(authStorageKey(url)).toBe(client["storageKey"]);
    },
  );
});

describe("readPersistedSession", () => {
  // Pins the stored format against auth-js itself, so an upgrade that changes it
  // fails here rather than quietly turning every offline boot into a sign-out.
  it("reads back the session exactly as auth-js stored it", async () => {
    const storage = memoryStorage();
    const auth = new AuthClient({
      url: "http://127.0.0.1:54321/auth/v1",
      storageKey: "test-auth-token",
      storage,
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    });
    await auth["_saveSession"](session);

    expect(readPersistedSession("test-auth-token", storage)).toEqual(session);
  });

  it("misses on an absent, malformed or partial value", () => {
    const storage = memoryStorage();
    expect(readPersistedSession("k", storage)).toBeNull();

    storage.setItem("k", "{not json");
    expect(readPersistedSession("k", storage)).toBeNull();

    storage.setItem("k", JSON.stringify({ access_token: "a", user: { id: "u" } }));
    expect(readPersistedSession("k", storage)).toBeNull();
  });

  it("misses when storage throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readPersistedSession("k", storage)).toBeNull();
  });
});
