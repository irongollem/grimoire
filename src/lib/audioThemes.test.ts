import { describe, it, expect } from "vitest";
import {
  normaliseTheme,
  tagsIncludeTheme,
  collectThemes,
  themePlaylists,
  themeSounds,
  resolveAudioTheme,
} from "@/lib/audioThemes";
import type { Sound, SoundboardPlaylist } from "@/types/sound.types";

function playlist(over: Partial<SoundboardPlaylist> & { id: string }): SoundboardPlaylist {
  return {
    campaign_id: "c", user_id: "u", page_id: null, name: over.id,
    playlist_type: "music", shuffle: false, repeat: true, sort_order: 0,
    tags: [], created_at: "", updated_at: "",
    ...over,
  } as SoundboardPlaylist;
}

function sound(over: Partial<Sound> & { id: string }): Sound {
  return {
    user_id: "u", campaign_id: "c", page_id: null, name: over.id,
    category: "music", source_type: "upload", file_url: "https://example.test/a.mp3",
    storage_path: null, tags: [], sort_order: 0, attribution: null, attribution_url: null,
    thumbnail_url: null, artist: null, gain_trim: 1, created_at: "", updated_at: "",
    ...over,
  } as Sound;
}

describe("normaliseTheme", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(normaliseTheme("  Battle Music ")).toBe("battle music");
  });

  it("collapses runs of whitespace", () => {
    expect(normaliseTheme("battle   music")).toBe("battle music");
  });
});

describe("tagsIncludeTheme", () => {
  it("matches regardless of how either side was typed", () => {
    expect(tagsIncludeTheme(["Battle"], "battle")).toBe(true);
    expect(tagsIncludeTheme(["battle"], " BATTLE ")).toBe(true);
  });

  it("requires a whole-tag match rather than a substring", () => {
    // "battle" must not be answered by a "battlefield ambience" tag — the DM
    // labelled that for something else.
    expect(tagsIncludeTheme(["battlefield"], "battle")).toBe(false);
  });

  it("never matches an empty theme", () => {
    expect(tagsIncludeTheme(["battle"], "")).toBe(false);
    expect(tagsIncludeTheme(["battle"], "   ")).toBe(false);
  });
});

describe("collectThemes", () => {
  it("dedupes case-insensitively but keeps the first spelling", () => {
    const themes = collectThemes(
      [playlist({ id: "p1", tags: ["Battle", "boss"] })],
      [sound({ id: "s1", tags: ["battle", "tavern"] })],
    );
    expect(themes).toEqual(["Battle", "boss", "tavern"]);
  });

  it("drops blank tags", () => {
    expect(collectThemes([playlist({ id: "p", tags: ["  ", "calm"] })], [])).toEqual(["calm"]);
  });

  it("is empty when nothing is labelled", () => {
    expect(collectThemes([playlist({ id: "p" })], [sound({ id: "s" })])).toEqual([]);
  });
});

describe("candidate filtering", () => {
  const playlists = [
    playlist({ id: "battle-music", playlist_type: "music", tags: ["battle"] }),
    playlist({ id: "battle-scene", playlist_type: "ambient", tags: ["battle"] }),
    playlist({ id: "calm-music", playlist_type: "music", tags: ["calm"] }),
  ];

  it("restricts playlists to the slot's own type", () => {
    expect(themePlaylists("battle", "music", playlists).map((p) => p.id)).toEqual(["battle-music"]);
    expect(themePlaylists("battle", "ambient", playlists).map((p) => p.id)).toEqual(["battle-scene"]);
  });

  it("restricts sounds to the matching category", () => {
    const sounds = [
      sound({ id: "war-drums", category: "music", tags: ["battle"] }),
      sound({ id: "clash", category: "effects", tags: ["battle"] }),
    ];
    expect(themeSounds("battle", "music", sounds).map((s) => s.id)).toEqual(["war-drums"]);
  });
});

describe("resolveAudioTheme", () => {
  const playlists = [
    playlist({ id: "p-a", playlist_type: "music", tags: ["battle"] }),
    playlist({ id: "p-b", playlist_type: "music", tags: ["Battle"] }),
    playlist({ id: "p-ambient", playlist_type: "ambient", tags: ["battle"] }),
  ];
  const sounds = [sound({ id: "s-a", category: "music", tags: ["battle"] })];

  it("prefers a playlist over a loose sound", () => {
    const match = resolveAudioTheme("battle", "music", playlists, sounds, () => 0);
    expect(match).toEqual({ kind: "playlist", playlist: playlists[0] });
  });

  it("varies across matching playlists, which is what makes repeat combats bearable", () => {
    const first = resolveAudioTheme("battle", "music", playlists, sounds, () => 0);
    const second = resolveAudioTheme("battle", "music", playlists, sounds, () => 1);
    expect(first).not.toEqual(second);
    expect(second).toEqual({ kind: "playlist", playlist: playlists[1] });
  });

  it("falls back to a loose sound when no playlist answers", () => {
    const match = resolveAudioTheme("battle", "music", [], sounds, () => 0);
    expect(match).toEqual({ kind: "sound", sound: sounds[0] });
  });

  it("returns null when nothing answers the theme", () => {
    // The caller must then leave the board completely alone — silence the DM
    // chose beats silence we chose.
    expect(resolveAudioTheme("dragon", "music", playlists, sounds)).toBeNull();
  });

  it("returns null for an empty theme rather than picking arbitrarily", () => {
    expect(resolveAudioTheme("", "music", playlists, sounds)).toBeNull();
  });

  it("does not look in the other slot when its own is empty", () => {
    // An ambient "battle" scene exists, but a music request must not grab it.
    expect(resolveAudioTheme("battle", "music", [playlists[2]], [])).toBeNull();
  });

  it("survives a picker that returns out of range", () => {
    const match = resolveAudioTheme("battle", "music", playlists, sounds, () => 99);
    expect(match).toEqual({ kind: "playlist", playlist: playlists[1] });
  });
});
