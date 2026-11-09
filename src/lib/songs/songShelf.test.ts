import { describe, expect, it } from "vitest";
import { type PlayerSongRow, songVolume, toShelves } from "./songShelf";

const row = (over: Partial<PlayerSongRow>): PlayerSongRow => ({
  campaign_id: "c1",
  campaign_name: "Kind Country",
  playlist_id: "p1",
  playlist_name: "Songs",
  sound_id: "s1",
  name: "Song",
  file_url: "https://example.invalid/s.mp3",
  thumbnail_url: null,
  artist: null,
  gain_trim: 1,
  ...over,
});

describe("toShelves", () => {
  it("makes one page per playlist, in the server's order, a song on each playlist that holds it", () => {
    const shelves = toShelves(
      [
        row({ playlist_id: "p2", sound_id: "a" }),
        row({ playlist_id: "p2", sound_id: "b" }),
        row({ playlist_id: "p1", sound_id: "a" }),
      ],
      20,
    );
    expect(shelves.map((s) => [s.playlistId, s.songs.map((x) => x.id)])).toEqual([
      ["p2", ["a", "b"]],
      ["p1", ["a"]],
    ]);
  });

  it("shows a song once even if the server repeats it within a playlist", () => {
    const shelves = toShelves([row({ sound_id: "a" }), row({ sound_id: "a" })], 20);
    expect(shelves[0]!.songs).toHaveLength(1);
  });

  it("gives a song the same picture and colour wherever it sits in the list", () => {
    const alone = toShelves([row({ sound_id: "song-x" })], 20)[0]!.songs[0]!;
    const later = toShelves([row({ sound_id: "first" }), row({ sound_id: "song-x" })], 20)[0]!.songs[1]!;
    expect([later.picture, later.colour]).toEqual([alone.picture, alone.colour]);
  });
});

describe("songVolume", () => {
  it("never plays louder than full, and treats a bad trim as unmodified", () => {
    expect(songVolume(1.6)).toBe(1);
    expect(songVolume(0.5)).toBe(0.5);
    expect(songVolume(0)).toBe(1);
    expect(songVolume(Number.NaN)).toBe(1);
  });
});
