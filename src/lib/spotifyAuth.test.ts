import { describe, it, expect } from "vitest";
import { readSpotifyError } from "./spotifyAuth";

function res(status: number, body: unknown): Response {
  return {
    status,
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
