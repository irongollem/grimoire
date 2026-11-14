import { setupSongs, teardownSongs } from "../setup/songs.ts";
import type { Episode } from "../types.ts";

/**
 * The songs page as one idea in under 20 seconds, payoff first (14 Nov 2026). The feature Reels lose most viewers
 * by the fourth second while a living painting held them for 19, so this one opens on a picture and a song, not on
 * the interface: Brilianto! starts with "Step right up, step right up!", which is the hook. No brand card in front
 * of it and no theme under it (`brand: false`), since the song is the sound, and the song plays on under the voice
 * to the end (`carryCues`), as it does on the phone. The longer `songs` Reel keeps the
 * whole walk-through.
 */
export const songsShort: Episode = {
  id: "songs-short",
  title: "Songs he plays himself",
  account: "player",
  device: "phone",
  campaign: "kind-country",
  brand: false,
  carryCues: true,
  setup: setupSongs,
  teardown: teardownSongs,
  seed: 3,
  shots: [
    {
      id: "hook",
      caption: "Step right up",
      narration: "",
      startAt: "/songs",
      async run({ page, tap, hold, focus, settled }) {
        const tile = page.getByRole("button", { name: "Play Brilianto!" }).filter({ visible: true }).first();
        await tile.waitFor({ timeout: 20_000 });
        await settled();
        // The camera starts on the picture: the Reel opens on a painting, not on a page.
        await focus(tile, { padding: 16 });
        await hold(700);
        await tap(tile, 600);
        await page.getByRole("button", { name: "Pause Brilianto!" }).filter({ visible: true }).first().waitFor({ timeout: 10_000 });
        await hold(3200);
      },
    },
    {
      id: "pictures",
      caption: "Songs for players who can't read yet",
      narration: "Our youngest is five and can't read yet. So his songs are pictures.",
      async run({ hold, focus }) {
        await focus(null);
        await hold(5600);
      },
    },
    {
      id: "himself",
      caption: "He plays them himself",
      narration: "He plays them himself.",
      async run({ page, hold, focus }) {
        await focus(page.getByRole("button", { name: "Pause Brilianto!" }).filter({ visible: true }).first(), { padding: 60 });
        await hold(2800);
      },
    },
  ],
};
