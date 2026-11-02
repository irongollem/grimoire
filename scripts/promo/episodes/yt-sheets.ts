import { setupYtSheets, teardownYtSheets } from "../setup/yt-sheets.ts";
import type { Page } from "playwright";
import type { Episode } from "../types.ts";

/**
 * HOW ONE VIDEO SHOWS BOTH SIDES
 *
 * The episode's account is the DM (desktop shots: the Party Tracker). Every phone shot sets `account: "player"`,
 * so it films the player fixture's own phone, signed in as Chicory's player. Each account and device pair is its
 * own signed-in page, so the first player phone shot has a `startAt`. The live effects come from the offstage DM
 * (a second, unfilmed DM browser on the Party page): its clicks reach the filmed player phone through the
 * campaign channel. The DM's preview feature is filmed only where the narration explains it (`dm-preview`).
 */

/** One hero's card on the Party Tracker: the bordered row that holds their portrait link. */
function heroCard(page: Page, name: string) {
  return page.locator("div.rounded-lg.border").filter({ has: page.getByRole("link", { name: `Open ${name}` }) }).first();
}

/** Dismisses the one-time "press and hold to pick advantage" tip without a tap ring. */
async function dismissTip(page: Page): Promise<void> {
  const got = page.getByText("Got it", { exact: true });
  if (await got.count()) await got.first().dispatchEvent("click");
}

/** Moves the phone to another page of the player portal through the app's router, without a page load. Written as a string because the scripts' tsconfig has no DOM types. */
async function goTo(page: Page, path: string): Promise<void> {
  await page.evaluate(`document.querySelector("#app").__vue_app__.config.globalProperties.$router.push(${JSON.stringify(path)})`);
}

/** Phone: the page header and the sticky hit point strip sit above a scrolled target. */
const PHONE_TOP = 160;

/**
 * Chicory's sheet as a player holds it, then the DM's tracker around it: sheet, skills, features and combat,
 * inventory, spells, levelling up, the Party Tracker, previewing, and the DM's changes landing on the phone.
 */
export const ytSheets: Episode = {
  id: "yt-sheets",
  title: "Character sheets and your party",
  account: "dm",
  format: "youtube",
  device: "desktop",
  setup: setupYtSheets,
  teardown: teardownYtSheets,
  seed: 7,
  /** The offstage DM is opened here, unfilmed, so the first live effect does not wait for a cold app. */
  async prepare({ offstage }) {
    const dm = await offstage("dm");
    await dm.open("/party");
  },
  shots: [
    // ── 1. Your party at a glance ───────────────────────────────────────────────────────────────
    {
      id: "party-overview",
      chapter: "Your party at a glance",
      caption: "Your whole party, one screen",
      narration:
        "Every character in your campaign lives in one place for you, the Party Tracker. Each hero gets a card with a portrait, hit points, armour class, speed, and the passive scores you check all the time. In this video we follow one of them, Chicory, a cleric, from both sides of the screen.",
      startAt: "/party",
      async run({ page, hold, scroll, scrollTo }) {
        await page.getByRole("heading", { name: "Party Tracker" }).waitFor();
        await hold(4000);
        await scroll(320, 1600);
        await hold(3500);
        await scrollTo(heroCard(page, "Chicory"), 1400, 150);
        await hold(8000);
      },
    },

    // ── 2. The player's sheet ───────────────────────────────────────────────────────────────────
    {
      id: "phone-open",
      chapter: "The player's sheet",
      device: "phone",
      account: "player",
      caption: "Chicory's sheet, on a phone",
      narration:
        "Now the player's side. This is Chicory's sheet on her player's own phone, signed in as her. She gets here from the Character tab at the bottom, and everything she needs in play is on it.",
      startAt: "/play/character",
      async run({ page, hold, settled }) {
        await page.getByText("Hit points").first().waitFor({ timeout: 15_000 });
        await settled();
        await hold(8500);
      },
    },
    {
      id: "sheet-header",
      device: "phone",
      account: "player",
      caption: "Every number, at the top",
      narration:
        "At the top are her name, class and level, and the numbers you need most. Armour class sits in the shield, then initiative, speed, proficiency bonus and hit dice. Under them are her hit points on a meter, with buttons to take damage or heal. Rest and Sleep, for short and long rests, sit beside any conditions she is under.",
      async run({ hold, scroll }) {
        await hold(4000);
        await scroll(240, 2000);
        await hold(5500);
        await scroll(260, 2000);
        await hold(7000);
      },
    },
    {
      id: "abilities",
      device: "phone",
      account: "player",
      caption: "Tap an ability to roll it",
      narration:
        "Six ability boxes close the card. Each shows the modifier large, the score in the oval, and the saving throw underneath, with a pip when she is proficient. Tap the ability to roll a check, or the save to roll a saving throw. The dice are rolled for you, with her bonus already added.",
      async run({ page, tap, hold, scrollTo }) {
        await scrollTo(page.getByText("Strength", { exact: true }), 1300, PHONE_TOP);
        await hold(5000);
        await scrollTo(page.getByText("Wisdom", { exact: true }), 800, PHONE_TOP + 20);
        await hold(1500);
        await tap(page.getByText("Wisdom", { exact: true }), 3000);
        // The fifth "Save" on the sheet is Wisdom's (Strength, Dexterity, Constitution, Intelligence, Wisdom).
        await tap(page.getByText("Save", { exact: true }).nth(4), 3500);
        await hold(6500);
      },
    },

    // ── 3. Skills and rolling ───────────────────────────────────────────────────────────────────
    {
      id: "skills",
      device: "phone",
      account: "player",
      chapter: "Skills and rolling",
      caption: "Tap a skill. Hold for advantage.",
      narration:
        "The Skills tab lists all eighteen. A filled circle means she is proficient, and a gold ring with a dot means expertise. Tap a skill to roll it. For advantage, press and hold, or right-click on a computer, and pick it for that one roll. The Roll with control does the same for her next roll, then goes back to normal.",
      async run({ page, tap, hold, scrollTo }) {
        // The Skills tab is the sheet's default tab, so the Roll with card and the passives sit just under the abilities.
        await scrollTo(page.getByText("Roll with", { exact: true }), 1200, PHONE_TOP);
        await hold(5000);
        await scrollTo(page.getByRole("button", { name: /^Perception/ }), 900, PHONE_TOP + 40);
        await hold(2500);
        await tap(page.getByRole("button", { name: /^Perception/ }), 3000);
        // Right-click is the desktop spelling of press and hold: both open the Normal / Advantage / Disadvantage picker.
        await page.getByRole("button", { name: /^Insight/ }).click({ button: "right" });
        await hold(1800);
        // The picker is mounted once at the root, after the Roll with control's own "Advantage" option.
        await tap(page.getByText("Advantage", { exact: true }).last(), 3200);
        await dismissTip(page);
        await hold(5500);
      },
    },

    // ── 4. Features and combat ──────────────────────────────────────────────────────────────────
    {
      id: "features",
      device: "phone",
      account: "player",
      chapter: "Features and combat",
      caption: "What her class gives her",
      narration:
        "The Features tab lists what her class and species give her, grouped by where each came from, with the level she gained it. A feature she can use only a few times shows its uses as pips, so you can see what is left.",
      async run({ page, tap, hold, scroll }) {
        await tap(page.getByRole("button", { name: "Features", exact: true }), 900);
        await hold(3500);
        await scroll(300, 1800);
        await hold(3500);
        await scroll(300, 1800);
        await hold(6000);
      },
    },
    {
      id: "combat",
      device: "phone",
      account: "player",
      caption: "Attack, then damage",
      narration:
        "On the Combat tab her mace has its own buttons. One tap for the attack roll, one for the damage. Hold on an attack to roll it with advantage. Further down, anything her class lets her do as an action, a bonus action or a reaction has a Use button, which spends the resource for you.",
      async run({ page, tap, hold, scroll, scrollTo, focus }) {
        await tap(page.getByRole("button", { name: "Combat", exact: true }), 900);
        await scrollTo(page.getByText("Mace", { exact: true }).first(), 1000, PHONE_TOP - 40);
        // The camera keeps to the mace: its card is all this moment needs.
        const card = page.getByRole("button", { name: /Attack \+3/ }).first().locator("xpath=../..");
        await focus(card, { padding: 36 });
        await hold(2200);
        await tap(page.getByRole("button", { name: /Attack \+3/ }).first(), 2200);
        await tap(page.getByRole("button", { name: /1d6/ }).first(), 300);
        await focus(card, { padding: 36 });
        await hold(900);
        await tap(page.getByRole("button", { name: /Roll 1d6/ }), 2500);
        await focus(null);
        await scroll(520, 2000);
        await hold(8500);
      },
    },

    // ── 5. Inventory and gear ───────────────────────────────────────────────────────────────────
    {
      id: "inventory",
      device: "phone",
      account: "player",
      chapter: "Inventory and gear",
      caption: "What she wears and carries",
      narration:
        "The Inventory page shows what she wears on a paper doll. Main hand, off hand, body armour and the rest sit in labelled slots around the figure, and what she wears feeds her armour class. Below it are her coins, how much she carries against what she can carry, then her belt and her backpack.",
      async run({ page, hold, scroll, settled }) {
        await goTo(page, "/play/inventory");
        await page.getByText("Coin Purse").first().waitFor({ timeout: 15_000 });
        await settled();
        await hold(5000);
        await scroll(420, 2200);
        await hold(4500);
        await scroll(420, 2200);
        await hold(7500);
      },
    },
    {
      id: "item-detail",
      device: "phone",
      account: "player",
      caption: "Tap any item for its details",
      narration:
        "Tap any item for its details and what you can do with it. Equip or unequip it, attune to it, spend a charge, or drop it into the chat for the table to see.",
      async run({ page, tap, hold, scrollTo }) {
        // An equipped well is named "<slot>: <item>" (EquipSlotRow).
        const mace = page.getByRole("button", { name: /Main hand: Mace/ });
        await scrollTo(mace, 1400, PHONE_TOP);
        await hold(1500);
        await tap(mace, 800);
        await hold(10500);
      },
    },

    // ── 6. Spells ───────────────────────────────────────────────────────────────────────────────
    {
      id: "spells",
      device: "phone",
      account: "player",
      chapter: "Spells",
      caption: "Cast a spell, spend a slot",
      narration:
        "Her spells are in the Spellbook. A slot strip shows every slot she has, and a filled pip is one still available. Open a level, press Cast on Bless, confirm the slot, and one goes dark, so everyone can see what is left. The page also shows how many spells she has prepared, against her limit.",
      async run({ page, tap, hold, settled }) {
        await goTo(page, "/play/spells");
        await settled();
        await hold(5500);
        await tap(page.getByText("1st Level", { exact: true }), 1800);
        await tap(page.getByRole("button", { name: "Cast" }).first(), 2500);
        await tap(page.getByRole("button", { name: "Cast", exact: true }).last(), 2500);
        await hold(9000);
      },
    },

    // ── 7. Levelling up ─────────────────────────────────────────────────────────────────────────
    {
      id: "levelup",
      device: "phone",
      account: "player",
      chapter: "Levelling up",
      caption: "The level up wizard",
      narration:
        "When she has earned a level, the level up wizard walks her through it. At tables that track experience, a Ready arrow appears by her XP bar. The wizard shows the class features she gains, lets her take the average hit points or roll the hit die, and asks for every choice the new level grants, like an ability score increase or new spells. Nothing changes until she presses Confirm.",
      async run({ page, hold, scroll, settled }) {
        await goTo(page, "/play/character/levelup");
        await page.getByText("Features Gained").first().waitFor({ timeout: 15_000 });
        await settled();
        await hold(5000);
        await scroll(380, 2200);
        await hold(4500);
        await scroll(380, 2200);
        await hold(4500);
        await scroll(380, 2200);
        await hold(4500);
        await scroll(380, 2200);
        await hold(3500);
        // Leave without confirming; the sheet is where the next chapter starts.
        await goTo(page, "/play/character");
        await settled();
        await hold(1500);
      },
    },

    // ── 8. The DM's Party Tracker ───────────────────────────────────────────────────────────────
    {
      id: "dm-cards",
      chapter: "The DM's Party Tracker",
      device: "desktop",
      caption: "Every hero's card, side by side",
      narration:
        "Back on the DM's screen. Each card has a coloured hit point bar, with Damage, Heal and Temp buttons that follow the rules: temporary hit points go first, and at zero a hero starts making death saves. Below that are armour class, speed, passive skills, the saving throws they are proficient in, and any conditions.",
      startAt: "/party",
      async run({ page, hold, scrollTo, focus }) {
        await page.getByRole("heading", { name: "Party Tracker" }).waitFor();
        await hold(1500);
        await scrollTo(heroCard(page, "Chicory"), 1200, 150);
        await hold(2500);
        // The card is wide: point the camera at it, then at the passive scores.
        await focus(heroCard(page, "Chicory"), { padding: 16 });
        await hold(7000);
        await focus(heroCard(page, "Chicory").getByText("Perception", { exact: true }), { padding: 150 });
        await hold(6500);
        await focus(null);
        await hold(2500);
      },
    },
    {
      id: "dm-sheet",
      caption: "Open any sheet, plus an Inventory tab",
      narration:
        "Open any hero and you get the full sheet, the same one the player sees, with an Inventory tab added so you can see everything she carries and wears. An Edit button opens the editor for anything you want to change.",
      async run({ page, tap, hold, focus, settled }) {
        await tap(page.getByRole("link", { name: "Open Chicory" }), 400);
        await page.getByText("Armor Class").first().waitFor({ timeout: 15_000 });
        await settled();
        await dismissTip(page);
        await focus(null);
        await hold(3500);
        await tap(page.getByRole("button", { name: "Inventory" }), 1500);
        await page.getByText("Coin Purse").first().waitFor({ timeout: 15_000 });
        await settled();
        await focus(page.getByText("Equipped", { exact: true }).first(), { padding: 120 });
        await hold(5500);
        await focus(null);
        await hold(4000);
      },
    },
    {
      id: "dm-packs",
      caption: "Every pack, side by side",
      narration:
        "At the bottom of the Party page, Packs puts every pack side by side, the party stash first, then each hero. Search across all of them to see who is carrying the mace, and narrow to attuned, magic or cursed items. You can give an item from one pack to another.",
      startAt: "/party",
      async run({ page, tap, type, hold, scrollTo }) {
        await page.getByRole("heading", { name: "Party Tracker" }).waitFor();
        await hold(800);
        await scrollTo(page.getByRole("heading", { name: "Packs" }), 1800, 100);
        await hold(4500);
        await type(page.getByPlaceholder(/Find in any pack/), "Mace");
        await hold(4000);
        await tap(page.getByRole("button", { name: "Clear" }), 800);
        await tap(page.getByRole("button", { name: "Magic", exact: true }), 2500);
        await tap(page.getByRole("button", { name: "Clear" }), 1000);
        await hold(4000);
      },
    },

    // ── 9. Previewing as a player ───────────────────────────────────────────────────────────────
    {
      id: "dm-preview",
      chapter: "Previewing as a player",
      caption: "See exactly what your player sees",
      narration:
        "Whenever you want to see what a player sees, use the eye button on their card. It opens the player portal as that character, with a banner to say you are previewing, and Exit Preview takes you back.",
      startAt: "/party",
      async run({ page, tap, hold, scrollTo, settled, focus }) {
        await page.getByRole("heading", { name: "Party Tracker" }).waitFor();
        await hold(800);
        await scrollTo(heroCard(page, "Chicory"), 900, 120);
        await hold(3000);
        await tap(heroCard(page, "Chicory").getByRole("button", { name: /Preview player portal/ }), 400);
        await page.getByRole("button", { name: "Exit Preview" }).waitFor({ timeout: 15_000 });
        await page.getByText("Hit points").first().waitFor({ timeout: 15_000 });
        await settled();
        // The player portal has no sidebar, so the resting view starts at the screen's left edge.
        await focus(null, { leftInset: 0 });
        await hold(12000);
        await tap(page.getByRole("button", { name: "Exit Preview" }), 1200);
      },
    },

    // ── 10. The DM's changes, live ──────────────────────────────────────────────────────────────
    {
      id: "live-damage",
      chapter: "Live changes from the DM",
      device: "phone",
      account: "player",
      caption: "The DM presses Damage. Her phone drops.",
      narration:
        "Now both sides at once. On a laptop off screen, the DM types twelve and presses Damage on Chicory. Watch her hit points on the phone. No refresh, no waiting. It lands on her sheet as soon as the DM presses the button.",
      async run({ page, hold, scrollTo, offstage }) {
        await scrollTo(page.getByText("Hit points").first(), 700, PHONE_TOP);
        await hold(6500);
        // The unfilmed DM, on the Party Page since `prepare`: 45 - 12 = 33.
        const dm = await offstage("dm");
        const card = heroCard(dm.page, "Chicory");
        await card.getByPlaceholder("Amt").fill("12");
        await card.getByRole("button", { name: "Damage" }).click();
        // The filmed phone must show it within a few seconds, or this take fails.
        await page.waitForFunction("/\\b33\\b/.test(document.body.innerText)", undefined, { timeout: 8_000 });
        await hold(6500);
      },
    },
    {
      id: "live-condition",
      device: "phone",
      account: "player",
      caption: "Conditions arrive the same way",
      narration:
        "Conditions work the same way. The DM adds Poisoned, and it appears on her sheet with a note on what it does to her rolls, disadvantage on attack rolls and ability checks. When the DM removes it, it disappears again.",
      async run({ page, hold, scrollTo, offstage }) {
        await hold(3500);
        const dm = await offstage("dm");
        const card = heroCard(dm.page, "Chicory");
        await card.getByRole("button", { name: /Condition/ }).click();
        // The picker is a dialog teleported to the page body (PartyConditionsPanel).
        await dm.page.getByRole("dialog", { name: "Add a condition" }).getByRole("button", { name: /^Poisoned/ }).click();
        await page.getByText("Poisoned").first().waitFor({ timeout: 8_000 });
        await hold(4500);
        // The note sits in the Roll with card under the abilities.
        await scrollTo(page.getByText("Roll with", { exact: true }), 1400, PHONE_TOP);
        await hold(6500);
      },
    },
    {
      id: "dm-heal",
      device: "desktop",
      caption: "Heal her, clear the condition",
      narration:
        "And the DM puts it right the same way. Type the amount, press Heal, and take the condition off with its cross. That is the character sheet and the party, from both sides of the table.",
      startAt: "/party",
      async run({ page, tap, type, hold, scrollTo }) {
        await page.getByRole("heading", { name: "Party Tracker" }).waitFor();
        await scrollTo(heroCard(page, "Chicory"), 1000, 150);
        await hold(2500);
        const card = heroCard(page, "Chicory");
        await type(card.getByPlaceholder("Amt"), "12");
        await hold(500);
        await tap(card.getByRole("button", { name: "Heal" }), 1800);
        await tap(card.getByRole("button", { name: "×" }).first(), 1800);
        await hold(2500);
      },
    },
  ],
};
