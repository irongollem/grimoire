import { LATER_PLAYLIST, setupSongs, sharePlaylist, teardownSongs } from "../setup/songs.ts";
import type { Episode } from "../types.ts";

/** The songs page on a young player's phone: picture buttons, a tap to play, and a shared playlist that arrives by itself. */
export const songs: Episode = {
  id: "songs",
  title: "Songs for players who can't read yet",
  account: "player",
  device: "phone",
  campaign: "kind-country",
  setup: setupSongs,
  teardown: teardownSongs,
  seed: 3,
  shots: [
    {
      id: "shelf",
      caption: "Songs for players who can't read yet",
      narration: "Our youngest player is five and can't read yet. But he knows his songs from the table.",
      startAt: "/songs",
      async run({ page, hold, scroll, settled }) {
        await page.getByRole("heading", { name: "Bright Stars" }).filter({ visible: true }).first().waitFor({ timeout: 20_000 });
        await settled();
        await hold(1800);
        await scroll(330, 1800);
        await hold(900);
        await scroll(-330, 1200);
        await hold(1200);
      },
    },
    {
      id: "tap",
      caption: "Tap a picture, the song plays",
      narration: "So every song he can play is a picture. Tap one and it plays.",
      async run({ page, tap, hold }) {
        await tap(page.getByRole("button", { name: "Play Caramella" }).filter({ visible: true }).first(), 600);
        await page.getByRole("button", { name: "Pause Caramella" }).filter({ visible: true }).first().waitFor({ timeout: 10_000 });
        await hold(4800);
      },
    },
    {
      id: "share",
      caption: "Share a playlist and it appears",
      narration: "When the DM ticks Players can listen on a playlist, it turns up on his screen by itself.",
      async run({ page, hold, tap, focus }) {
        await hold(1800);
        // The DM's tick, made offstage: the change rings the campaign doorbell and the open page re-reads.
        sharePlaylist(LATER_PLAYLIST);
        const bar = page.getByRole("navigation", { name: "Playlists" }).filter({ visible: true }).first();
        await bar.waitFor({ timeout: 20_000 });
        // The new picture is small at the foot of the screen, so the camera goes to it for a beat.
        await focus(bar, { padding: 60 });
        await hold(1800);
        await focus(null);
        await tap(page.getByRole("button", { name: LATER_PLAYLIST }).filter({ visible: true }).first(), 2200);
      },
    },
    {
      id: "pinned",
      caption: "Grimoire Songs, on the home screen",
      narration: "Pin it to the home screen and it opens as its own app, Grimoire Songs. No menus, no reading.",
      async run({ page, hold, tap, focus }) {
        await tap(page.getByRole("button", { name: "Bright Stars" }).filter({ visible: true }).first(), 1200);
        await focus(page.locator("header").filter({ visible: true }).first(), { padding: 24 });
        await hold(2200);
        await focus(null);
        await hold(2200);
      },
    },
  ],
};
