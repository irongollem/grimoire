import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  buildAuthUrl,
  exchangeCode,
  getValidToken,
  readSpotifyError,
  spotifyFetch,
  SpotifyUnreachableError,
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
