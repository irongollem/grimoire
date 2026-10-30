import { setupSheets } from "../setup/sheets.ts";
import type { Page } from "playwright";
import type { Episode } from "../types.ts";

/** Dismisses the one-time "press and hold to pick advantage" tip without a tap ring, so it never sits on a shot. */
async function dismissTip(page: Page): Promise<void> {
  const got = page.getByText("Got it", { exact: true });
  if (await got.count()) await got.first().dispatchEvent("click");
}

/** The player with a full character sheet on a phone. Its pair, `sheets-dm`, is the DM looking at the same sheet. */
export const sheetsPlayer: Episode = {
  id: "sheets-player",
  title: "Character sheets: your hero in your pocket",
  pairedWith: "sheets-dm",
  account: "player",
  setup: setupSheets,
  seed: 11,
  shots: [
    {
      id: "sheet",
      caption: "Your whole hero, on your phone",
      narration: "This is Chicory, a cleric, and every number she has. Hit points, armour class, and all six abilities, laid out to read at a glance.",
      startAt: "/play/character",
      async run({ page, hold, scroll, scrollTo }) {
        await dismissTip(page);
        await hold(2200);
        await scrollTo(page.getByText("Strength", { exact: true }), 1300, 150);
        await hold(2200);
        await scroll(0, 10);
      },
    },
    {
      id: "checks",
      caption: "Tap to roll. Hold for advantage.",
      narration: "Tap an ability to roll a check. Press and hold a saving throw, and you can roll it with advantage.",
      async run({ page, tap, hold, scrollTo }) {
        await scrollTo(page.getByText("Wisdom", { exact: true }), 700, 170);
        await tap(page.getByText("Wisdom", { exact: true }), 2300);
        const save = page.getByText("Save", { exact: true }).nth(4);
        await save.click({ button: "right" });
        await hold(1200);
        await tap(page.getByText("Advantage", { exact: true }).last(), 2400);
      },
    },
    {
      id: "combat",
      caption: "Attack, then damage",
      narration: "On the Combat tab her mace has its own buttons. One tap for the attack roll, one for the damage.",
      async run({ page, tap, hold, scrollTo, focus }) {
        await dismissTip(page);
        await tap(page.getByRole("button", { name: "Combat" }), 900);
        await scrollTo(page.getByText("Mace", { exact: true }).first(), 1000, 150);
        // The camera keeps to the mace: its card is all this shot needs.
        const card = page.getByRole("button", { name: /Attack \+3/ }).first().locator("xpath=../..");
        await focus(card, { padding: 36 });
        await hold(1300);
        await tap(page.getByRole("button", { name: /Attack \+3/ }).first(), 1900);
        await tap(page.getByRole("button", { name: /1d6/ }).first(), 300);
        await focus(card, { padding: 36 });
        await hold(900);
        await tap(page.getByRole("button", { name: /Roll 1d6/ }), 2200);
      },
    },
    {
      id: "spells",
      caption: "Cast a spell, spend a slot",
      narration: "Open the spellbook, pick Bless, and cast it. A slot on the board goes dark, so you always know what is left.",
      startAt: "/play/spells",
      async run({ page, tap, hold }) {
        await hold(1400);
        await tap(page.getByText("1st Level", { exact: true }), 900);
        await tap(page.getByRole("button", { name: "Cast" }).first(), 1500);
        await tap(page.getByRole("button", { name: "Cast", exact: true }).last(), 1800);
        await hold(1500);
      },
    },
    {
      id: "gear",
      caption: "Mace, shield and scale mail",
      narration: "And her gear sits on a paper doll. What she carries, and what she is wearing, in one place.",
      startAt: "/play/inventory",
      async run({ hold }) {
        await hold(3800);
      },
    },
  ],
};
