import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useSpotifyStore } from "@/stores/spotify";
import { getValidToken, spotifyFetch, SpotifyUnreachableError } from "@/lib/audio/spotifyAuth";

// The auth helpers own the network; here they are doubles so the store's
// error routing can be exercised without a DOM fetch. SpotifyUnreachableError
// stays real — the store's catch discriminates on instanceof.
vi.mock("@/lib/audio/spotifyAuth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/audio/spotifyAuth")>();
  return {
    ...original,
    getValidToken: vi.fn(),
    spotifyFetch: vi.fn(),
    getStoredTokens: vi.fn(() => null),
  };
});

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ isDM: true }),
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaign: { spotify_client_id: "client-id" } }),
}));

const mockGetValidToken = vi.mocked(getValidToken);
const mockSpotifyFetch = vi.mocked(spotifyFetch);

const unreachable = () => new SpotifyUnreachableError("https://api.spotify.com/v1/me");

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mockGetValidToken.mockResolvedValue("token");
});

describe("network-level Spotify failures", () => {
  // The DUNGEON-GRIMOIRE-4 shape: fetchAccount fired by the SDK's ready event
  // while api.spotify.com was unreachable, ending as an unhandled rejection.
  it("fetchAccount surfaces unreachable on the banner instead of rejecting", async () => {
    const store = useSpotifyStore();
    mockSpotifyFetch.mockRejectedValue(unreachable());

    await store.fetchAccount();

    expect(store.playError).toContain("api.spotify.com");
    expect(store.spotifyUser).toBeNull();
  });

  it("play surfaces unreachable and does not record the track as played", async () => {
    const store = useSpotifyStore();
    store.deviceId = "device-1";
    mockSpotifyFetch.mockRejectedValue(unreachable());

    await store.play("https://open.spotify.com/track/abc123");

    expect(store.playError).toContain("api.spotify.com");
    expect(store.lastPlayedUrl).toBeNull();
  });

  it("setShuffle surfaces unreachable and leaves the local state untouched", async () => {
    const store = useSpotifyStore();
    store.deviceId = "device-1";
    mockSpotifyFetch.mockRejectedValue(unreachable());

    await store.setShuffle(true);

    expect(store.playError).toContain("api.spotify.com");
    expect(store.shuffleOn).toBe(false);
  });

  it("a non-network failure still rejects — real bugs must keep reaching Sentry", async () => {
    const store = useSpotifyStore();
    mockSpotifyFetch.mockRejectedValue(new TypeError("x is not a function"));

    await expect(store.fetchAccount()).rejects.toThrow("x is not a function");
  });
});

describe("play recovery (#1098)", () => {
  const response = (status: number, body: unknown = {}) =>
    new Response(status === 204 ? null : JSON.stringify(body), { status });

  it("says the player is still connecting instead of doing nothing", async () => {
    const store = useSpotifyStore();

    await store.play("https://open.spotify.com/track/abc123");

    expect(store.playError).toContain("still connecting");
    expect(mockSpotifyFetch).not.toHaveBeenCalled();
  });

  it("re-registers a lost device and retries the play once", async () => {
    const store = useSpotifyStore();
    store.deviceId = "device-1";
    mockSpotifyFetch
      .mockResolvedValueOnce(response(404, { error: { message: "Device not found" } }))
      .mockResolvedValueOnce(response(204))
      .mockResolvedValueOnce(response(204));

    await store.play("https://open.spotify.com/track/abc123");

    const urls = mockSpotifyFetch.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      "https://api.spotify.com/v1/me/player/play?device_id=device-1",
      "https://api.spotify.com/v1/me/player",
      "https://api.spotify.com/v1/me/player/play?device_id=device-1",
    ]);
    expect(JSON.parse(mockSpotifyFetch.mock.calls[1][1]?.body as string)).toEqual({
      device_ids: ["device-1"],
      play: false,
    });
    expect(store.playError).toBeNull();
    expect(store.lastPlayedUrl).toBe("https://open.spotify.com/track/abc123");
  });

  it("reports Device not found when the device cannot be re-registered", async () => {
    const store = useSpotifyStore();
    store.deviceId = "device-1";
    mockSpotifyFetch.mockImplementation(async () =>
      response(404, { error: { message: "Device not found" } }),
    );

    await store.play("https://open.spotify.com/track/abc123");

    expect(mockSpotifyFetch).toHaveBeenCalledTimes(2);
    expect(store.playError).toBe("Device not found");
    expect(store.lastPlayedUrl).toBeNull();
  });
});
