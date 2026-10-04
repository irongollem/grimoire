import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaylistTrackWithSound } from "@/types/sound.types";

const inMock = vi.fn();
const fromMock = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { from: (...args: unknown[]) => fromMock(...args) } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({}) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({}) }));

import { fetchTracksForPlaylists, groupTracksByPlaylist } from "./useSoundboardPlaylists";

function track(id: string, playlist_id: string): PlaylistTrackWithSound {
  return { id, playlist_id } as unknown as PlaylistTrackWithSound;
}

describe("fetchTracksForPlaylists", () => {
  beforeEach(() => {
    fromMock.mockReset();
    inMock.mockReset();
  });

  it("sends nothing for no playlists", async () => {
    expect(await fetchTracksForPlaylists([])).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("reads all playlists in one request", async () => {
    const rows = [track("t1", "p1"), track("t2", "p2")];
    inMock.mockReturnValue({ order: () => Promise.resolve({ data: rows, error: null }) });
    fromMock.mockReturnValue({ select: () => ({ in: inMock }) });
    expect(await fetchTracksForPlaylists(["p1", "p2", "p3"])).toEqual(rows);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(inMock).toHaveBeenCalledWith("playlist_id", ["p1", "p2", "p3"]);
  });

  it("throws the database error", async () => {
    const error = new Error("boom");
    fromMock.mockReturnValue({ select: () => ({ in: () => ({ order: () => Promise.resolve({ data: null, error }) }) }) });
    await expect(fetchTracksForPlaylists(["p1"])).rejects.toBe(error);
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
