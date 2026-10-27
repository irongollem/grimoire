// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  buildAuthUrl,
  exchangeCode,
  getStoredTokens,
  getValidToken,
  isSpotifyCollection,
  readSpotifyError,
  spotifyFetch,
  SpotifyUnreachableError,
  urlToUri,
} from "@/lib/audio/spotifyAuth";

function res(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as unknown as Response;
}

describe("readSpotifyError", () => {
  it("prefers error_description, which is the human-readable one", async () => {
    const msg = await readSpotifyError(res(400, { error: "invalid_grant", error_description: "Invalid redirect URI" }));
    expect(msg).toContain("400");
    expect(msg).toContain("Invalid redirect URI");
  });

  it("falls back to a flat error string", async () => {
    const msg = await readSpotifyError(res(400, { error: "invalid_client" }));
    expect(msg).toContain("invalid_client");
  });

  it("reads the nested Web API error shape", async () => {
    // api.spotify.com nests differently from accounts.spotify.com.
    const msg = await readSpotifyError(res(403, { error: { status: 403, message: "User not registered in the Developer Dashboard" } }));
    expect(msg).toContain("User not registered");
  });

  it("names both 403 causes, because neither is fixable in this codebase", async () => {
    const msg = await readSpotifyError(res(403, { error: { message: "Forbidden" } }));
    // The API/SDK declaration is the one that catches out apps created before
    // Spotify split Web API and Web Playback SDK into separate checkboxes.
    expect(msg).toContain("Web Playback SDK");
    expect(msg).toContain("User Management");
  });

  it("does not add the dashboard hint to non-403 failures", async () => {
    const msg = await readSpotifyError(res(401, { error: "invalid_token" }));
    expect(msg).not.toContain("User Management");
  });

  it("degrades to the status alone when the body is not JSON", async () => {
    const broken = { status: 502, json: async () => { throw new Error("not json"); } } as unknown as Response;
    expect(await readSpotifyError(broken)).toBe("Spotify returned 502");
  });
});

describe("spotifyFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("turns a network-level throw into SpotifyUnreachableError, naming the host", async () => {
    // What a dead connection or a blocked request looks like from fetch().
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));

    await expect(spotifyFetch("https://api.spotify.com/v1/me")).rejects.toMatchObject({
      name: "SpotifyUnreachableError",
      message: expect.stringContaining("api.spotify.com") as unknown,
    });
  });

  it("passes an error response through untouched — only transport failures convert", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res(403, {}))));

    const r = await spotifyFetch("https://api.spotify.com/v1/me");
    expect(r.status).toBe(403);
  });
});

describe("getValidToken when a refresh is due", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
    localStorage.setItem("spotify_tokens", JSON.stringify({
      access_token: "expired",
      refresh_token: "refresh",
      expires_at: Date.now() - 1_000,
      client_id: "client-id",
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("throws SpotifyUnreachableError and keeps the tokens when Spotify is unreachable", async () => {
    // Being offline is not being logged out: the caller must be able to tell
    // the two apart, or a Wi-Fi blip during refresh wipes a valid session.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));

    await expect(getValidToken("client-id")).rejects.toBeInstanceOf(SpotifyUnreachableError);
    expect(localStorage.getItem("spotify_tokens")).toBeTruthy();
  });

  it("returns null when Spotify itself rejects the refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(res(400, { error: "invalid_grant" }))));

    expect(await getValidToken("client-id")).toBeNull();
  });
});

describe("Spotify OAuth state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
  });

  it("adds a random state to the authorization request", async () => {
    const url = new URL(await buildAuthUrl("client-id"));

    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe(localStorage.getItem("spotify_oauth_state"));
  });

  it("rejects a callback whose state does not match before exchanging its code", async () => {
    await buildAuthUrl("client-id");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(exchangeCode("authorization-code", "wrong-state")).rejects.toThrow(
      "Spotify login state did not match",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("isSpotifyCollection", () => {
  it("is false for a single track or episode, which sit on the board as pads", () => {
    expect(isSpotifyCollection("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc")).toBe(false);
    expect(isSpotifyCollection("https://open.spotify.com/episode/0Q86acNRm6V9GYx55SXKwf")).toBe(false);
    expect(isSpotifyCollection("spotify:track:4uLU6hMCjMI75M1A2tKUQC")).toBe(false);
  });

  it("is true for a playlist or album, which keep their own running order", () => {
    expect(isSpotifyCollection("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBe(true);
    expect(isSpotifyCollection("https://open.spotify.com/intl-nl/album/1DFixLWuPkv3KT3TnV35m3")).toBe(true);
    expect(isSpotifyCollection("spotify:album:1DFixLWuPkv3KT3TnV35m3")).toBe(true);
  });
});


// ── Token lifecycle ──────────────────────────────────────────────────────────

function stubStorage(): Map<string, string> {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  return values;
}

function storeTokenSet(over: Partial<{ access_token: string; refresh_token: string; expires_at: number; client_id: string }> = {}) {
  localStorage.setItem(
    "spotify_tokens",
    JSON.stringify({ access_token: "access", refresh_token: "refresh", expires_at: Date.now() + 3_600_000, client_id: "client-id", ...over }),
  );
}

describe("getValidToken", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    stubStorage();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const refreshReply = (body: Record<string, unknown>) => fetchMock.mockResolvedValue(res(200, { expires_in: 3600, ...body }));

  it("is null when nobody is logged in, without asking Spotify", async () => {
    expect(await getValidToken("client-id")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is null, and keeps the tokens, while the campaign's client id has not loaded", async () => {
    storeTokenSet();
    expect(await getValidToken("")).toBeNull();
    expect(getStoredTokens()?.access_token).toBe("access");
  });

  it("drops tokens that were issued to a different Spotify app", async () => {
    storeTokenSet({ client_id: "someone-elses-app" });
    expect(await getValidToken("client-id")).toBeNull();
    expect(getStoredTokens()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hands back a token that has more than a minute left, without refreshing", async () => {
    storeTokenSet({ expires_at: Date.now() + 61_000 });
    expect(await getValidToken("client-id")).toBe("access");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes once the token is within a minute of expiring", async () => {
    storeTokenSet({ expires_at: Date.now() + 59_000 });
    refreshReply({ access_token: "fresh" });
    expect(await getValidToken("client-id")).toBe("fresh");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves the stored tokens alone when Spotify refuses the refresh", async () => {
    storeTokenSet({ expires_at: Date.now() - 1 });
    fetchMock.mockResolvedValue(res(400, { error: "invalid_grant" }));
    expect(await getValidToken("client-id")).toBeNull();
    expect(getStoredTokens()).toMatchObject({ access_token: "access", refresh_token: "refresh" });
  });

  it("treats corrupt stored tokens as logged out", async () => {
    localStorage.setItem("spotify_tokens", "{not json");
    expect(getStoredTokens()).toBeNull();
    expect(await getValidToken("client-id")).toBeNull();
  });

  it("refreshes a token that is still good when asked to force it", async () => {
    storeTokenSet();
    refreshReply({ access_token: "forced" });
    expect(await getValidToken("client-id", true)).toBe("forced");
  });

  it("keeps the old refresh token when Spotify does not send a new one, and takes a new one when it does", async () => {
    storeTokenSet({ expires_at: Date.now() - 1 });
    refreshReply({ access_token: "a2" });
    await getValidToken("client-id");
    expect(getStoredTokens()).toMatchObject({ access_token: "a2", refresh_token: "refresh", client_id: "client-id" });

    storeTokenSet({ expires_at: Date.now() - 1 });
    refreshReply({ access_token: "a3", refresh_token: "rotated" });
    await getValidToken("client-id");
    expect(getStoredTokens()?.refresh_token).toBe("rotated");
  });

  it("dates the refreshed token from the reply's lifetime", async () => {
    storeTokenSet({ expires_at: Date.now() - 1 });
    refreshReply({ access_token: "a2", expires_in: 1800 });
    const before = Date.now();
    await getValidToken("client-id");
    const expiresAt = getStoredTokens()?.expires_at ?? 0;
    expect(expiresAt).toBeGreaterThanOrEqual(before + 1_800_000);
    expect(expiresAt).toBeLessThan(before + 1_800_000 + 5_000);
  });
});

describe("buildAuthUrl and exchangeCode", () => {
  const fetchMock = vi.fn();
  let store: Map<string, string>;

  beforeEach(() => {
    store = stubStorage();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const base64Url = (bytes: ArrayBuffer) =>
    btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  it("asks for the S256 challenge of the verifier it keeps, with the account chooser and the streaming scopes", async () => {
    const url = new URL(await buildAuthUrl("client-id"));
    const verifier = store.get("spotify_code_verifier") ?? "";
    expect(verifier.length).toBeGreaterThanOrEqual(43); // RFC 7636: 43 to 128 characters
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));

    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("code_challenge")).toBe(base64Url(digest));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(`${window.location.origin}/spotify/callback`);
    expect(url.searchParams.get("show_dialog")).toBe("true");
    expect(url.searchParams.get("scope")).toContain("streaming");
  });

  it("trades the code for tokens bound to the client that asked, and spends the state and verifier", async () => {
    await buildAuthUrl("client-id");
    const state = store.get("spotify_oauth_state") ?? "";
    const verifier = store.get("spotify_code_verifier") ?? "";
    fetchMock.mockResolvedValue(res(200, { access_token: "acc", refresh_token: "ref", expires_in: 3600 }));
    const before = Date.now();

    const tokens = await exchangeCode("the-code", state);

    expect(tokens).toMatchObject({ access_token: "acc", refresh_token: "ref", client_id: "client-id" });
    expect(tokens.expires_at).toBeGreaterThanOrEqual(before + 3_600_000);
    expect(getStoredTokens()).toEqual(tokens);
    const sent = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(sent.get("code")).toBe("the-code");
    expect(sent.get("code_verifier")).toBe(verifier);
    expect(sent.get("grant_type")).toBe("authorization_code");
    // The same callback cannot be replayed, and nothing of the login is left lying in storage.
    await expect(exchangeCode("the-code", state)).rejects.toThrow("state did not match");
    expect([...store.keys()].filter((k) => k !== "spotify_tokens")).toEqual([]);
  });

  it("refuses a callback that carries no state at all", async () => {
    await buildAuthUrl("client-id");
    await expect(exchangeCode("the-code", undefined)).rejects.toThrow("state did not match");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says where to look when the verifier is missing (the login began on another domain)", async () => {
    await buildAuthUrl("client-id");
    const state = store.get("spotify_oauth_state") ?? "";
    store.delete("spotify_code_verifier");
    await expect(exchangeCode("the-code", state)).rejects.toThrow(`No PKCE verifier found for ${window.location.origin}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the client id it was given over the one it stored, and fails with none", async () => {
    await buildAuthUrl("stored-id");
    const state = store.get("spotify_oauth_state") ?? "";
    fetchMock.mockResolvedValue(res(200, { access_token: "a", refresh_token: "r", expires_in: 60 }));
    const tokens = await exchangeCode("c", state, "explicit-id");
    expect(tokens.client_id).toBe("explicit-id");

    store.clear();
    store.set("spotify_oauth_state", "s");
    store.set("spotify_code_verifier", "v");
    await expect(exchangeCode("c", "s")).rejects.toThrow("No Spotify client ID");
  });

  it("surfaces Spotify's own reason when the exchange is refused", async () => {
    await buildAuthUrl("client-id");
    const state = store.get("spotify_oauth_state") ?? "";
    fetchMock.mockResolvedValue(res(400, { error_description: "Invalid redirect URI" }));
    await expect(exchangeCode("c", state)).rejects.toThrow("Invalid redirect URI");
  });
});

describe("urlToUri", () => {
  it.each([
    ["https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc", "spotify:track:4uLU6hMCjMI75M1A2tKUQC"],
    ["https://open.spotify.com/intl-nl/playlist/37i9dQZF1DXcBWIGoYBM5M", "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"],
    ["https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3", "spotify:album:1DFixLWuPkv3KT3TnV35m3"],
    ["https://open.spotify.com/episode/0Q86acNRm6V9GYx55SXKwf", "spotify:episode:0Q86acNRm6V9GYx55SXKwf"],
  ])("turns %s into %s", (url, uri) => {
    expect(urlToUri(url)).toBe(uri);
  });

  it("is null for anything that is not a track, playlist, album or episode link", () => {
    expect(urlToUri("https://open.spotify.com/artist/abc123")).toBeNull();
    expect(urlToUri("https://example.com/track/abc123")).toBeNull();
    expect(urlToUri("not a url")).toBeNull();
  });
});
