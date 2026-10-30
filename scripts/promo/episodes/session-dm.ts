import { setupSession, teardownSession } from "../setup/session.ts";
import type { Page } from "playwright";
import type { Episode } from "../types.ts";

/** The soundboard panel that opens by itself when the session's scene starts playing; its close button sits after "Stop All". */
function closeSoundboardPanel(page: Page) {
  return page.getByRole("button", { name: "Stop All" }).first().locator("xpath=following-sibling::button");
}

/** The DM running a table from the dashboard. Its pair, `session-player`, is the same session starting on the player's tablet. */
export const sessionDm: Episode = {
  id: "session-dm",
  title: "The DM screen: one tap and the table is live",
  pairedWith: "session-player",
  account: "dm",
  device: "desktop",
  setup: setupSession,
  teardown: teardownSession,
  seed: 3,
  shots: [
    {
      id: "arrange",
      caption: "Arrange your DM screen your way",
      narration: "Your dashboard is yours to arrange. Open Customize, make a widget wider or taller, and press Done.",
      startAt: "/dashboard",
      async run({ page, tap, hold, focus }) {
        await hold(1600);
        await tap(page.getByRole("button", { name: "Customize" }), 1200);
        await tap(page.getByRole("button", { name: /^Wider, currently/ }).first(), 1300);
        await tap(page.getByRole("button", { name: /^Taller, currently 1/ }).first(), 1500);
        await focus(null);
        await tap(page.getByRole("button", { name: "Done" }), 1400);
      },
    },
    {
      id: "start",
      caption: "Start the session. Players see it.",
      narration: "When the table sits down, start the session. Your screen switches to the table, and a live rail keeps the time.",
      async run({ page, tap, hold, focus }) {
        await tap(page.getByRole("button", { name: "Start session", exact: true }).first(), 1500);
        await tap(page.getByRole("dialog").getByRole("button", { name: "Start session 3" }).last(), 2200);
        const rail = page.getByText(/session 3 live/i).first();
        await focus(rail.locator("xpath=../.."), { padding: 40 });
        await hold(2200);
        await focus(null);
        await tap(closeSoundboardPanel(page), 1200);
      },
    },
    {
      id: "quest",
      caption: "Quests open ready to run",
      narration: "Open a quest and it is ready to run. The cockpit keeps the story in front of you, with a thread for every path.",
      startAt: "/quests",
      async run({ page, tap, hold, settled }) {
        // The log is on screen and loaded before the shot starts; the cockpit is waited for before anything moves.
        await page.getByText("The Locked Workshop").first().waitFor();
        await settled();
        await hold(900);
        await tap(page.getByText("The Locked Workshop").first(), 400);
        await page.getByText("Threads in this quest", { exact: false }).first().waitFor({ timeout: 15_000 });
        await settled();
        await hold(600);
        await hold(3200);
      },
    },
    {
      id: "sounds",
      caption: "Soundboard becomes your pads",
      narration: "And the soundboard turns into performance pads: the scene that is playing on top, big artwork, and nothing to edit by accident.",
      startAt: "/soundboard",
      async run({ page, hold, scroll, settled }) {
        await page.getByText("Ambient sounds & music for your sessions").first().waitFor();
        await settled();
        await hold(2200);
        await scroll(260, 1300);
        await hold(1800);
      },
    },
  ],
};
