import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { DEFAULT_LAYER, type PlaylistTrackWithSound } from "@/types/sound.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({ campaignId: "camp-1" as string | null }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get activeCampaignId() {
      return session.campaignId;
    },
  }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "user-1" } }) }));
// storeToRefs needs a pinia store; the campaign store is a plain object here.
vi.mock("pinia", async (orig) => ({
  ...(await orig<typeof import("pinia")>()),
  storeToRefs: (store: { activeCampaignId: string | null }) => ({
    activeCampaignId: { get value() { return store.activeCampaignId; } },
  }),
}));

import {
  fetchTracksForPlaylists,
  groupTracksByPlaylist,
  useDeletePlaylist,
  usePlaylists,
  useReplacePlaylistTracks,
} from "./useSoundboardPlaylists";

function track(id: string, playlist_id: string, sort_order = 0): PlaylistTrackWithSound {
  return { id, playlist_id, sort_order } as Partial<PlaylistTrackWithSound> as PlaylistTrackWithSound;
}

function inApp<T>(setup: () => T) {
  let result!: T;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mount(
    defineComponent({ setup() { result = setup(); return () => h("div"); } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { result, queryClient };
}

beforeEach(() => {
  fake.reset();
  session.campaignId = "camp-1";
});

describe("fetchTracksForPlaylists", () => {
  it("sends nothing for no playlists", async () => {
    expect(await fetchTracksForPlaylists([])).toEqual([]);
    expect(fake.calls).toEqual([]);
  });

  it("reads the requested playlists' tracks in one request, in play order, and no other playlist's", async () => {
    fake.seed("soundboard_playlist_tracks", [
      { id: "t2", playlist_id: "p1", sort_order: 1 },
      { id: "t1", playlist_id: "p1", sort_order: 0 },
      { id: "t3", playlist_id: "p2", sort_order: 0 },
      { id: "x", playlist_id: "p9", sort_order: 0 },
    ]);
    const rows = await fetchTracksForPlaylists(["p1", "p2", "p3"]);
    // Ordered by sort_order across the whole read; ties keep the stored order.
    expect(rows.map((r) => r.id)).toEqual(["t1", "t3", "t2"]);
    expect(fake.calls).toHaveLength(1);
  });

  it("throws the database error", async () => {
    fake.failNext("soundboard_playlist_tracks", { message: "boom" });
    await expect(fetchTracksForPlaylists(["p1"])).rejects.toMatchObject({ message: "boom" });
  });
});

describe("groupTracksByPlaylist", () => {
  it("groups by playlist, keeps order, and gives an empty playlist an empty list", () => {
    const grouped = groupTracksByPlaylist(["p1", "p2"], [track("a", "p1"), track("b", "p1"), track("c", "other")]);
    expect(grouped.get("p1")?.map((t) => t.id)).toEqual(["a", "b"]);
    expect(grouped.get("p2")).toEqual([]);
    expect(grouped.has("other")).toBe(false);
  });
});

describe("usePlaylists", () => {
  it("lists the active campaign's playlists by sort order, then name, never another campaign's", async () => {
    fake.seed("soundboard_playlists", [
      { id: "b", campaign_id: "camp-1", sort_order: 1, name: "Zed" },
      { id: "a2", campaign_id: "camp-1", sort_order: 0, name: "Beta" },
      { id: "a1", campaign_id: "camp-1", sort_order: 0, name: "Alpha" },
      { id: "o", campaign_id: "camp-2", sort_order: 0, name: "Other" },
    ]);
    const { result } = inApp(() => usePlaylists());
    await flushPromises();
    expect((result.data.value ?? []).map((p) => p.id)).toEqual(["a1", "a2", "b"]);
  });

  it("reads nothing without a campaign, or while the caller holds it back", async () => {
    session.campaignId = null;
    const none = inApp(() => usePlaylists());
    session.campaignId = "camp-1";
    const held = inApp(() => usePlaylists(() => false));
    await flushPromises();
    expect(none.result.data.value).toBeUndefined();
    expect(held.result.data.value).toBeUndefined();
    expect(fake.calls).toEqual([]);
  });
});

describe("useReplacePlaylistTracks", () => {
  const stored = (playlist: string) =>
    fake.rows("soundboard_playlist_tracks").filter((r) => r.playlist_id === playlist);

  beforeEach(() => {
    fake.seed("soundboard_playlist_tracks", [
      { id: "old1", playlist_id: "p1", sound_id: "s-old", sort_order: 0 },
      { id: "old2", playlist_id: "p1", sound_id: "s-old2", sort_order: 1 },
      { id: "keep", playlist_id: "p2", sound_id: "s-keep", sort_order: 0 },
    ]);
  });

  it("replaces one playlist's tracks in the order given, leaving every other playlist alone", async () => {
    const { result } = inApp(() => useReplacePlaylistTracks());
    await result.mutateAsync({ playlistId: "p1", tracks: [{ soundId: "s-b" }, { soundId: "s-a" }] });
    expect(stored("p1").map((r) => [r.sound_id, r.sort_order])).toEqual([["s-b", 0], ["s-a", 1]]);
    expect(stored("p2").map((r) => r.id)).toEqual(["keep"]);
  });

  it("gives a track the column defaults unless a scene set its own layer, which wins", async () => {
    const { result } = inApp(() => useReplacePlaylistTracks());
    await result.mutateAsync({
      playlistId: "p1",
      tracks: [{ soundId: "s-a" }, { soundId: "s-b", layer: { is_generator: true, layer_volume: 0.3 } }],
    });
    const [plain, layered] = stored("p1");
    expect(plain).toMatchObject({ layer_volume: DEFAULT_LAYER.layer_volume, is_generator: false });
    expect(layered).toMatchObject({ layer_volume: 0.3, is_generator: true, min_interval_s: DEFAULT_LAYER.min_interval_s });
  });

  it("an empty list clears the playlist", async () => {
    const { result } = inApp(() => useReplacePlaylistTracks());
    await result.mutateAsync({ playlistId: "p1", tracks: [] });
    expect(stored("p1")).toEqual([]);
    expect(stored("p2")).toHaveLength(1);
  });
});

describe("useDeletePlaylist", () => {
  const playlists = [
    { id: "a", campaign_id: "camp-1", sort_order: 0, name: "A" },
    { id: "b", campaign_id: "camp-1", sort_order: 1, name: "B" },
  ];

  it("takes the card off the grid and keeps it gone once the delete lands", async () => {
    fake.seed("soundboard_playlists", playlists);
    const { result, queryClient } = inApp(() => useDeletePlaylist());
    queryClient.setQueryData(["soundboard_playlists", "camp-1"], playlists);
    await result.mutateAsync("a");
    expect(fake.rows("soundboard_playlists").map((p) => p.id)).toEqual(["b"]);
    expect((queryClient.getQueryData(["soundboard_playlists", "camp-1"]) as { id: string }[]).map((p) => p.id)).toEqual(["b"]);
  });

  it("puts the card back when the delete fails", async () => {
    fake.seed("soundboard_playlists", playlists);
    fake.failNext("soundboard_playlists", { message: "denied" }, { after: 0 });
    const { result, queryClient } = inApp(() => useDeletePlaylist());
    queryClient.setQueryData(["soundboard_playlists", "camp-1"], playlists);
    await expect(result.mutateAsync("a")).rejects.toMatchObject({ message: "denied" });
    expect(fake.rows("soundboard_playlists").map((p) => p.id)).toEqual(["a", "b"]);
    expect((queryClient.getQueryData(["soundboard_playlists", "camp-1"]) as { id: string }[]).map((p) => p.id)).toEqual(["a", "b"]);
  });
});
