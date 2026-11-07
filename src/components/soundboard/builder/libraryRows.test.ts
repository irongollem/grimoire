import { describe, expect, it } from "vitest";
import type { Sound, SoundboardPlaylist } from "@/types/sound.types";
import { DRAG_PLAYLIST, DRAG_SOUND, dragTypeFor, libraryRows } from "./libraryRows";

function sound(over: Partial<Sound>): Sound {
  return {
    id: "s1", user_id: "u", campaign_id: "c", name: "Door slam", category: "effects",
    source_type: "upload", file_url: "https://example.test/a.mp3", storage_path: null, library_id: null,
    tags: [], attribution: null, attribution_url: null, thumbnail_url: null, artist: null,
    gain_trim: 1, created_at: "", updated_at: "", ...over,
  };
}

function playlist(over: Partial<SoundboardPlaylist>): SoundboardPlaylist {
  return {
    id: "p1", campaign_id: "c", user_id: "u", name: "Tavern", playlist_type: "ambient",
    shuffle: false, repeat: false, sort_order: 0, tags: [], library_scene_slug: null, created_at: "", updated_at: "", ...over,
  } as SoundboardPlaylist;
}

const ALL = { query: "", category: "all" } as const;

describe("libraryRows", () => {
  it("keeps a Spotify playlist off the Sounds tab and on the Playlists tab", () => {
    // Bug: a Spotify album listed as a sound would be placed as a take and never play right.
    const album = sound({ id: "sp", name: "Epic album", source_type: "spotify", file_url: "https://open.spotify.com/album/abc" });
    const track = sound({ id: "tr", name: "One song", source_type: "spotify", file_url: "https://open.spotify.com/track/abc" });
    const sounds = libraryRows("sounds", [album, track], [], new Map(), ALL).map((r) => r.name);
    expect(sounds).toEqual(["One song"]);
    const lists = libraryRows("playlists", [album, track], [], new Map(), ALL);
    expect(lists.map((r) => r.name)).toEqual(["Epic album"]);
    expect(lists[0]?.placement).toEqual({ kind: "sound", id: "sp" });
    expect(lists[0]?.category).toBe("music");
  });

  it("filters by search over name and tags", () => {
    const rows = libraryRows("sounds", [sound({ id: "a", name: "Thunder", tags: ["storm"] }), sound({ id: "b", name: "Door" })], [], new Map(), {
      query: "storm", category: "all",
    });
    expect(rows.map((r) => r.name)).toEqual(["Thunder"]);
  });

  it("filters by category, and a category filter hides scenes that are not ambient", () => {
    const sounds = [sound({ id: "a", category: "music" }), sound({ id: "b", category: "effects" })];
    expect(libraryRows("sounds", sounds, [], new Map(), { query: "", category: "music" }).map((r) => r.key)).toEqual(["sound:a"]);
    expect(libraryRows("scenes", [], [playlist({})], new Map(), { query: "", category: "effects" })).toEqual([]);
  });

  it("counts a scene's layers and a playlist's tracks, and nothing for a sound", () => {
    // Bug: a count read from the wrong playlist id would badge every scene with the same number.
    const scenes = libraryRows("scenes", [], [playlist({}), playlist({ id: "p3" })], new Map([["p1", 1], ["p3", 4]]), ALL);
    expect(scenes.map((r) => r.count)).toEqual([1, 4]);
    const list = libraryRows("playlists", [], [playlist({ id: "p2", playlist_type: "music" })], new Map([["p2", 3]]), ALL)[0];
    expect(list?.count).toBe(3);
    expect(libraryRows("sounds", [sound({ id: "a" })], [], new Map(), ALL)[0]?.count).toBeNull();
  });

  it("tells a music track from a playlist and an ambience track from a scene", () => {
    // Bug: the colour is shared within a category, so a row that took its kind from the category alone would call a scene an ambience track.
    const sounds = [sound({ id: "m", category: "music" }), sound({ id: "a", category: "ambient" }), sound({ id: "e", category: "effects" })];
    expect(libraryRows("sounds", sounds, [], new Map(), ALL).map((r) => r.kind)).toEqual(["music", "ambience", "effect"]);
    expect(libraryRows("scenes", [], [playlist({})], new Map(), ALL)[0]?.kind).toBe("scene");
    expect(libraryRows("playlists", [], [playlist({ id: "p2", playlist_type: "music" })], new Map(), ALL)[0]?.kind).toBe("playlist");
  });

  it("names the drag type by what is dragged", () => {
    expect(dragTypeFor({ kind: "sound", id: "x" })).toBe(DRAG_SOUND);
    expect(dragTypeFor({ kind: "playlist", id: "x" })).toBe(DRAG_PLAYLIST);
  });
});
