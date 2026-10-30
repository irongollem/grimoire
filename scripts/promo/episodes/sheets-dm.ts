import { setupSheets } from "../setup/sheets.ts";
import type { Page } from "playwright";
import type { Episode } from "../types.ts";

/** One hero's card on the Party Tracker: the bordered row that holds their portrait link. */
function heroCard(page: Page, name: string) {
  return page.locator("div.rounded-lg.border").filter({ has: page.getByRole("link", { name: `Open ${name}` }) }).first();
}

/** Dismisses the one-time roll tip without a tap ring. */
async function dismissTip(page: Page): Promise<void> {
  const got = page.getByText("Got it", { exact: true });
  if (await got.count()) await got.first().dispatchEvent("click");
}

/** The DM's side of the sheets. Its pair, `sheets-player`, is the player rolling from the same sheet on a phone. */
export const sheetsDm: Episode = {
  id: "sheets-dm",
  title: "Character sheets: the whole party at a glance",
  pairedWith: "sheets-player",
  account: "dm",
  device: "desktop",
  setup: setupSheets,
  seed: 5,
  shots: [
    {
      id: "tracker",
      caption: "Your whole party, at a glance",
      narration: "The Party Tracker shows every hero together: hit points, armour class, speed and the skills you ask about most.",
      startAt: "/party",
      async run({ page, offstage, hold, scroll, scrollTo }) {
        // The player's own page, never filmed: the damage shot checks that it hears about the hit.
        const player = await offstage("player");
        await player.page.goto(`${player.base}/play/character`);
        await page.getByRole("heading", { name: "Party Tracker" }).waitFor();
        await hold(2200);
        await scroll(300, 1400);
        await hold(1400);
        // Chicory's card at the top of the screen, so no page heading is left half in frame.
        await scrollTo(heroCard(page, "Chicory"), 1200, 150);
        await hold(2400);
      },
    },
    {
      id: "damage",
      caption: "Damage or heal, right from here",
      narration: "When she takes a hit, type the damage and press Damage, and her hit points drop. Her own screen updates at once.",
      async run({ page, offstage, tap, type, hold, scrollTo }) {
        const card = heroCard(page, "Chicory");
        await scrollTo(heroCard(page, "Chicory"), 600, 150);
        await hold(900);
        await type(card.getByPlaceholder("Amt"), "12");
        await hold(500);
        await tap(card.getByRole("button", { name: "Damage" }), 1500);
        // 45 - 12: the player's page, off camera, must show it within a few seconds, or this take fails.
        const player = await offstage("player");
        await player.page.waitForFunction('/\\b33\\b/.test(document.body.innerText)', undefined, { timeout: 8_000 });
        await hold(1400);
      },
    },
    {
      id: "sheet",
      caption: "Open any sheet, same as the player's",
      narration: "Open her sheet and it is the very same one the player sees. Her gear is a tab away.",
      async run({ page, tap, hold, focus, settled }) {
        await tap(page.getByRole("link", { name: "Open Chicory" }), 400);
        await page.getByText("Armor Class").first().waitFor({ timeout: 15_000 });
        await settled();
        await dismissTip(page);
        await focus(null);
        await hold(2200);
        await tap(page.getByRole("button", { name: "Inventory" }), 1500);
        await page.getByText("Coin Purse").first().waitFor({ timeout: 15_000 });
        await settled();
        await focus(page.getByText("Equipped", { exact: true }).first(), { padding: 120 });
        await hold(2800);
        await focus(null);
      },
    },
    {
      id: "preview",
      caption: "See exactly what your player sees",
      narration: "Want to know what a player sees? Preview the player portal as her, and you are looking at her screen, then step back out.",
      startAt: "/party",
      async run({ page, tap, hold, scrollTo, settled, focus }) {
        await page.getByRole("heading", { name: "Party Tracker" }).waitFor();
        await hold(500);
        await scrollTo(heroCard(page, "Chicory"), 900, 120);
        await hold(600);
        await tap(heroCard(page, "Chicory").getByRole("button", { name: /Preview player portal/ }), 400);
        await page.getByRole("button", { name: "Exit Preview" }).waitFor({ timeout: 15_000 });
        await page.getByText("Hit points").first().waitFor({ timeout: 15_000 });
        await settled();
        await focus(null, { leftInset: 0 });
        await hold(3200);
        await tap(page.getByRole("button", { name: "Exit Preview" }), 1200);
      },
    },
  ],
};
