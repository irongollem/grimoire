import { setupSession, teardownSession } from "../setup/session.ts";
import type { Episode } from "../types.ts";

/** The player's tablet while the DM starts the session. Its pair, `session-dm`, is the DM's side of the same moment. */
export const sessionPlayer: Episode = {
  id: "session-player",
  title: "The DM screen: you can tell the table is live",
  pairedWith: "session-dm",
  account: "player",
  device: "tablet",
  setup: setupSession,
  teardown: teardownSession,
  seed: 9,
  shots: [
    {
      id: "between",
      caption: "Between sessions, your Hearth waits",
      narration: "Between games, this is your Hearth: your character, your quests, and the next session on the calendar.",
      startAt: "/play",
      async run({ offstage, hold }) {
        // The DM's browser is opened here so it is warm before the moment that matters.
        const dm = await offstage("dm");
        await dm.open("/npcs");
        await dm.open("/dashboard");
        await hold(2200);
      },
    },
    {
      id: "live",
      caption: "Your DM starts. You see it live.",
      narration: "Then your DM starts the session, and your screen knows at once. A live marker appears, the Hearth turns to the table, and the chat announces that the session begins.",
      async run({ page, offstage, tap, hold }) {
        const dm = await offstage("dm");
        await tap(page.getByRole("button", { name: /chat/i }).first(), 1500);
        await dm.page.getByRole("button", { name: "Start session", exact: true }).first().click();
        await dm.page.getByRole("dialog").getByRole("button", { name: "Start session 3" }).last().click();
        await page.getByText("The session begins.").first().waitFor({ timeout: 20_000 });
        await hold(4200);
      },
    },
    {
      id: "reveal",
      caption: "Reveals land in your chat",
      narration: "And when your DM reveals someone you have met, they appear in your chat while you watch.",
      async run({ page, offstage, hold }) {
        const dm = await offstage("dm");
        // Not `dm.open`: that waits up to 15 s for a network that never goes quiet, and nobody is filming the DM's page.
        await dm.page.goto(`${dm.base}/npcs`);
        await dm.page.getByRole("button", { name: "Reveal Sister Ribbon to players" }).click();
        await dm.page.getByRole("button", { name: "Whole party" }).click();
        await page.getByText("Sister Ribbon").first().waitFor({ timeout: 20_000 });
        await hold(3800);
      },
    },
  ],
};
