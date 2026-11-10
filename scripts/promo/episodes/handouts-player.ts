import { LETTER_ID, LETTER_TITLE, setupHandouts, teardownHandouts } from "../setup/handouts.ts";
import type { Episode } from "../types.ts";

/** The player's phone while the DM gives the letter. Its pair, `handouts-dm`, is the DM's side of the same moment. */
export const handoutsPlayer: Episode = {
  id: "handouts-player",
  title: "Handouts: the letter lands on your phone",
  pairedWith: "handouts-dm",
  account: "player",
  device: "phone",
  setup: setupHandouts,
  teardown: teardownHandouts,
  seed: 6,
  async prepare({ offstage }) {
    // The DM's browser is warmed on the letter before the take, so Give to players is one click when it matters.
    const dm = await offstage("dm");
    await dm.open(`/scriptorium/${LETTER_ID}`);
  },
  shots: [
    {
      id: "arrive",
      caption: "Your DM hands you a letter",
      narration: "Open your Journal, then the Handouts tab. When your DM gives the party a letter, it lands here with an unread mark, live.",
      startAt: "/play/journal?tab=handouts",
      async run({ page, offstage, hold, settled }) {
        const dm = await offstage("dm");
        await settled();
        await hold(2200);
        await dm.page.getByRole("button", { name: "Give to players" }).click();
        const dialog = dm.page.getByRole("dialog");
        await dialog.getByRole("button", { name: "Whole party" }).click();
        await dialog.getByRole("button", { name: "Give it" }).click();
        await dialog.waitFor({ state: "detached" });
        await page.getByText(LETTER_TITLE).first().waitFor({ timeout: 20_000 });
        await hold(3500);
      },
    },
    {
      id: "open",
      caption: "Tap it to read it",
      narration: "Tap the letter and it opens as a page you can read, on its own paper, sketches and all.",
      async run({ page, tap, hold, settled, scrollTo }) {
        await tap(page.getByText(LETTER_TITLE).first(), 1200);
        await page.waitForURL(/\/play\/handouts\//);
        await settled();
        await hold(2600);
        // Down to the keeper's sketch under the postscript, so the page shows it carries a picture too.
        await scrollTo(page.getByRole("img", { name: "The keeper's sketch of a glass hound on the rocks" }), 1600, 140);
        await hold(2600);
      },
    },
    {
      id: "back",
      caption: "Read, and the mark goes away",
      narration: "Go back to Handouts and the unread mark is gone. The letter stays here whenever you need it.",
      async run({ page, hold, settled }) {
        await page.goBack();
        await settled();
        await hold(600);
        await page.getByText(LETTER_TITLE).first().waitFor();
        await hold(3500);
      },
    },
  ],
};
