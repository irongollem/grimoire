import { describe, expect, it } from "vitest";
import { renderSongPictures } from "./renderSongPictures";
import { SONG_PICTURE_SVGS } from "./songPictures.generated";

describe("the classic songs page's pictures", () => {
  // A song's picture is how a child who cannot read finds it, on whichever phone. If SONG_PICTURES changes and the
  // generated copy does not, the old phone shows a rabbit where the new one shows a fish.
  it("are exactly the app's SONG_PICTURES (regenerate with scripts/classic-song-pictures.ts)", async () => {
    expect(await renderSongPictures()).toEqual(SONG_PICTURE_SVGS);
  });
});
