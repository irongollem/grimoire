import type { Page } from "playwright";
import { setupSession, teardownSession } from "../setup/session.ts";
import type { Episode } from "../types.ts";

/** The Deck at deck size: pressing D until the dock says so (the size is remembered), then the settle. */
async function openDeck(page: Page, hold: (ms: number) => Promise<void>) {
  const dock = page.getByTestId("deck-dock");
  for (let i = 0; i < 4 && (await dock.getAttribute("data-size")) !== "deck"; i++) {
    await page.keyboard.press("d");
    await hold(500);
  }
  await hold(700);
}

/**
 * Where the camera looks at the Deck: the page tabs and NOW chips down through the second row of pads, across the
 * first four lanes (Music to Effects), so a pad name is readable on a phone. Drawn as an invisible box because no one
 * element holds exactly that part of the Deck.
 */
async function deckFrame(page: Page) {
  const box = async (name: RegExp) => {
    const b = await page.getByRole("button", { name }).first().boundingBox();
    if (!b) throw new Error(`No pad ${name}`);
    return b;
  };
  const a = await box(/^Candy Workshop Wonder,/);
  const e = await box(/^creaking glass slowed down,/);
  const m = await box(/^Market Morning,/);
  const tabs = await page.getByRole("tablist", { name: "Pages" }).boundingBox();
  if (!tabs) throw new Error("No deck page tabs");
  const x = a.x;
  const y = tabs.y;
  // Browser code as text: the scripts' tsconfig has no DOM types.
  const w = e.x + e.width - x;
  const h = m.y + m.height - y;
  await page.evaluate(`(() => {
    document.getElementById("promo-deck-frame")?.remove();
    const d = document.createElement("div");
    d.id = "promo-deck-frame";
    d.style.cssText = "position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;pointer-events:none;opacity:0";
    document.body.appendChild(d);
  })()`);
  return page.locator("#promo-deck-frame");
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
      narration: "Everyone seated? Press Start session. Your dashboard turns to At the table, the clock starts, and the inn's sounds begin by themselves.",
      async run({ page, tap, hold, focus }) {
        await tap(page.getByRole("button", { name: "Start session", exact: true }).first(), 1500);
        await tap(page.getByRole("dialog").getByRole("button", { name: "Start session 3" }).last(), 2200);
        const rail = page.getByText(/session 3 live/i).first();
        await focus(rail.locator("xpath=../.."), { padding: 40 });
        await hold(1800);
        await focus(null);
        await hold(2600);
      },
    },
    {
      id: "quest",
      caption: "Quests open ready to run",
      narration: "Open a quest and its Session cockpit is ready to run. Under Threads in this quest, every path has a thread.",
      startAt: "/quests",
      async run({ page, tap, hold, settled, focus }) {
        // The log is on screen and loaded before the shot starts; the cockpit is waited for before anything moves.
        await page.getByText("The Locked Workshop").first().waitFor();
        await settled();
        await hold(900);
        await tap(page.getByText("The Locked Workshop").first(), 400);
        await page.getByText("Threads in this quest", { exact: false }).first().waitFor({ timeout: 15_000 });
        await settled();
        await page.mouse.move(900, 600);
        await focus(page.getByText("Threads in this quest", { exact: false }).first().locator("xpath=../.."), { padding: 60 });
        await hold(3800);
      },
    },
    {
      id: "deck",
      caption: "The Deck sits under every page",
      narration: "The Deck sits under every page. Press a Music pad and it plays. Press another in the same lane, and the first one fades out.",
      startAt: "/dashboard",
      async run({ page, tap, hold, focus, settled }) {
        await settled();
        await openDeck(page, hold);
        await focus(await deckFrame(page), { padding: 12 });
        await hold(1400);
        await tap(page.getByRole("button", { name: /^Candy Workshop Wonder,/ }), 3000);
        await tap(page.getByRole("button", { name: /^Market Morning,/ }), 3600);
      },
    },
    {
      id: "effect",
      caption: "Effects play over the music",
      narration: "A pad in the Effects lane plays over the music, and never stops it.",
      startAt: "/dashboard",
      async run({ page, tap, hold, focus, settled }) {
        await settled();
        await openDeck(page, hold);
        await focus(await deckFrame(page), { padding: 12 });
        await tap(page.getByRole("button", { name: /^Market Morning,/ }), 1400);
        await tap(page.getByRole("button", { name: /^creaking glass slowed down,/ }), 2000);
        await hold(500);
      },
    },
  ],
};
