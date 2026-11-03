import {
  closeSoundboard,
  combatantWrap,
  damage,
  KITCHEN_ID,
  listColumn,
  nextTurn,
  RUN_PATH,
  revealMonster,
  setInitiatives,
  setupCombat,
  teardownCombat,
} from "../setup/combat.ts";
import { builderCard, hpOf, MONSTERS, ORDER, scrollPanel, sideCard, waitActive } from "../setup/yt-combat.ts";
import type { Episode } from "../types.ts";

const wrap = combatantWrap;

/** Where the video starts: the Kitchen encounter in its editor. Nothing is changed or saved there. */
const BUILDER_PATH = `/encounters/${KITCHEN_ID}?edit=true`;

/**
 * Combat in Dungeon Grimoire, the long version of the `combat-dm` / `combat-player` Reels.
 *
 * The episode is filmed as the DM on a desktop. The "what your players see" shots set `account: "player"` and
 * `device: "phone"` to film Chicory's own phone instead, while an offstage DM (a second, unfilmed browser) presses
 * Next Turn and applies damage. The filmed DM laptop sits on the runner untouched meanwhile and follows the live
 * row when it is filmed again. The fight is the Reels' "Working Kitchen"; the builder shots only look, search and
 * scroll, so Run Encounter writes nothing.
 */
export const ytCombat: Episode = {
  id: "yt-combat",
  title: "Combat in Dungeon Grimoire",
  account: "dm",
  format: "youtube",
  device: "desktop",
  setup: setupCombat,
  teardown: teardownCombat,
  seed: 11,
  async prepare({ offstage }) {
    // Warms the unfilmed DM browser (a cold app compile can take a while), so the player shots can use it at once.
    await offstage("dm");
  },
  shots: [
    // ── Chapter 1: building the encounter ─────────────────────────────────────────────────────────
    {
      id: "intro",
      chapter: "Building the encounter",
      caption: "Combat in Dungeon Grimoire",
      narration:
        "In this video we run a whole fight in Dungeon Grimoire, from building the encounter to the last turn. You will see the dungeon master's screen, and we will cut to a player's phone to show what it does.",
      startAt: BUILDER_PATH,
      async run({ page, scroll, hold }) {
        // The whole builder, unhurried: a slow scroll down and back so the page is not a still frame.
        await page.getByRole("heading", { name: "Combatants", exact: true }).waitFor({ timeout: 20_000 });
        await hold(2500);
        await scroll(600, 4000);
        await hold(1500);
        await scroll(-600, 3500);
        await hold(3000);
      },
    },
    {
      id: "build-details",
      caption: "Name it, place it, pick the party",
      narration:
        "An encounter starts in the builder. Under Details, give it a name, a description for the scene, and the location where it happens. Then, in Party Members, tick the heroes and companions who are in the fight. A pet is left out, because it never fights.",
      async run({ page, scrollTo, focus, hold }) {
        await scrollTo(page.getByRole("heading", { name: "Details", exact: true }), 900, 90);
        await focus(builderCard(page, "Details"), { padding: 16 });
        await hold(6000);
        await scrollTo(page.getByRole("heading", { name: "Party Members", exact: true }), 1200, 90);
        await focus(builderCard(page, "Party Members"), { padding: 16 });
        await hold(8000);
        await focus(null);
        await hold(1000);
      },
    },
    {
      id: "build-combatants",
      caption: "Add monsters and NPCs",
      narration:
        "Combatants are the enemies. Add Monster searches your bestiary, and Add NPC picks from your NPCs. Each entry has a count, so one line can be a whole pack, and a faction, which decides whose side it fights on.",
      async run({ page, scrollTo, focus, tap, type, hold }) {
        await scrollTo(page.getByRole("heading", { name: "Combatants", exact: true }), 1200, 90);
        await focus(builderCard(page, "Combatants"), { padding: 16 });
        await hold(3500);
        // Searching only filters a list: nothing is added, so the encounter stays as it is.
        const combatants = builderCard(page, "Combatants");
        await tap(combatants.getByRole("button", { name: "Add Monster" }), 800);
        await type(page.getByPlaceholder("Search monsters…"), "hound");
        await hold(4500);
        await tap(combatants.getByRole("button", { name: "Add Monster" }), 800);
        await hold(3500);
        await focus(null);
        await hold(1500);
      },
    },
    {
      id: "build-difficulty",
      caption: "Difficulty, checked as you build",
      narration:
        "On the right, Difficulty Analysis weighs the enemies against your party. You get the enemy experience, the adjusted total, and where it falls against the party's thresholds, so you can tune the fight before you run it.",
      async run({ page, scrollTo, focus, hold }) {
        await scrollTo(page.getByRole("heading", { name: "Difficulty Analysis", exact: true }), 1400, 90);
        await focus(builderCard(page, "Difficulty Analysis"), { padding: 16 });
        await hold(9500);
        await focus(null);
        await hold(2500);
      },
    },
    {
      id: "build-extras",
      caption: "Events, loot, traps and music",
      narration:
        "Below that sit Events, Loot, and Traps and Hazards. Events fire on a round, a hit point threshold, a death, or when you choose. Loot and traps travel with the fight, and a trap counts toward the difficulty. There is even a Battle music theme, and starting combat asks your soundboard for a matching playlist.",
      async run({ page, scrollTo, focus, hold }) {
        const events = sideCard(page, "Events");
        await scrollTo(events, 1200, 90);
        await focus(events, { padding: 24 });
        await hold(5000);
        const loot = sideCard(page, "Loot");
        await focus(loot, { padding: 24 });
        await hold(3500);
        const traps = sideCard(page, "Traps");
        await focus(traps, { padding: 24 });
        await hold(4000);
        const music = page.getByText("Battle music theme", { exact: true });
        await scrollTo(music, 1400, 200);
        await focus(music.locator("xpath=ancestor::div[1]"), { padding: 32 });
        await hold(6000);
        await focus(null);
      },
    },
    {
      id: "build-run",
      caption: "Run Encounter",
      narration: "When you are ready, press Run Encounter. The runner opens at Pre-Combat, the lobby before the first round.",
      async run({ page, scrollTo, focus, tap, hold, settled }) {
        const run = page.getByRole("button", { name: "Run Encounter" });
        await scrollTo(run, 1200, 20);
        await focus(run, { padding: 60 });
        await hold(2200);
        // Nothing was edited, so saving before it runs writes no column at all.
        await tap(run, 600);
        await page.getByText("Pre-Combat").first().waitFor({ timeout: 20_000 });
        await page.getByRole("button", { name: "Go Live" }).waitFor({ timeout: 20_000 });
        await settled();
        await focus(null);
        await hold(2500);
      },
    },

    // ── Chapter 2: going live and initiative ──────────────────────────────────────────────────────
    {
      id: "live-golive",
      chapter: "Going live and initiative",
      caption: "Go Live shares the fight with players",
      narration:
        "Before you start, go live. That shares the fight with your players, and starts a session if one is not already running. Each player is told on their phone to roll their own initiative.",
      async run({ page, tap, focus, hold }) {
        await hold(2000);
        await tap(page.getByRole("button", { name: "Go Live", exact: true }), 800);
        await page.locator(".go-live-btn.live-active").waitFor({ timeout: 20_000 });
        await hold(3000);
        await focus(page.locator(".go-live-btn"), { padding: 140 });
        await hold(5500);
        await focus(null);
      },
    },
    {
      id: "live-reveal",
      caption: "Choose which monsters your players see",
      narration:
        "Every monster starts hidden from your players. Click the eye on its portrait to cycle it: hidden, then unseen, then revealed. Players see an unseen monster only as question marks, and a revealed one by name and portrait. Revealing a monster also adds it to the players' bestiary.",
      async run({ page, tap, hold, focus }) {
        await focus(await listColumn(page), { padding: 0 });
        await hold(3000);
        const eye = wrap(page, "Toffee Maw").locator(".reveal-btn");
        await tap(eye, 3000);
        await page.getByRole("button", { name: "Unseen. Click to reveal" }).first().waitFor({ timeout: 5_000 });
        await tap(eye, 3500);
        await page.getByRole("button", { name: "Revealed. Click to hide" }).first().waitFor({ timeout: 5_000 });
        for (const name of MONSTERS) await revealMonster(page, name);
        await hold(6000);
        await focus(null);
      },
    },
    {
      id: "live-initiative",
      caption: "Roll for everyone, or type the numbers",
      narration:
        "Now the order. Roll Initiative rolls for everyone who has no number yet, and never overwrites one. Every box is editable, so you can type a number a player calls out, and the die beside it rolls just that creature again. Players roll their own on their phones, and the lobby shows who is still to roll. Ties are marked, so you can settle them.",
      async run({ page, tap, hold, focus }) {
        await focus(await listColumn(page), { padding: 0 });
        await hold(3500);
        await tap(page.getByRole("button", { name: "Roll Initiative", exact: true }), 1500);
        // A manual-entry prompt would mean the dice mode is physical, not the app's own roller.
        await page.waitForFunction(
          `[...document.querySelectorAll("input")].some((i) => i.getAttribute("aria-label") === "Initiative for Toffee Maw" && i.value !== "")`,
          undefined,
          { timeout: 15_000 },
        );
        await hold(4500);
        // The numbers the rest of the video relies on, typed in as a DM would after a player calls theirs out.
        await setInitiatives(page, ORDER);
        await hold(8000);
        await focus(null);
      },
    },
    {
      id: "live-start",
      caption: "Start Combat",
      narration:
        "Press Start Combat. If a player has not rolled yet, Grimoire asks once, names them, and rolls for them, never overwriting a number that is already there. Then the round counter starts at one and the top of the order is lit.",
      async run({ page, tap, hold, focus }) {
        const start = page.getByRole("button", { name: "Start Combat" });
        await focus(start, { padding: 120 });
        await hold(5500);
        await tap(start, 800);
        // Every initiative is set, so no "not everyone has rolled" dialog should stand in the way.
        await page.getByText("Round 1").first().waitFor({ timeout: 20_000 });
        await closeSoundboard(page);
        await hold(1500);
        await focus(await listColumn(page), { padding: 0 });
        await hold(7500);
        await focus(null);
      },
    },

    // ── Chapter 3: running the round ──────────────────────────────────────────────────────────────
    {
      id: "run-order",
      chapter: "Running the round",
      caption: "Everyone in turn order",
      narration:
        "This is the initiative list, the heart of the runner. Each row shows initiative, name, hit points, armour class and conditions. The active turn is ringed, and each side wears its faction colour down the edge.",
      async run({ page, hold, focus }) {
        await hold(2500);
        await focus(wrap(page, "Toffee Maw"), { padding: 30 });
        await hold(4500);
        await focus(wrap(page, "Fresco"), { padding: 30 });
        await hold(4000);
        await focus(null);
        await hold(2500);
      },
    },
    {
      id: "run-damage",
      caption: "Damage in one tap",
      narration:
        "To hurt something, click its row, type the amount and press Dmg. Heal and Plus Temp sit beside it. Temporary hit points soak up damage first, and a hero who drops to zero starts making death saves, with the rules applied for you. Or nudge hit points with the plus and minus, or type straight into the box.",
      async run({ page, tap, type, hold, focus }) {
        const maw = wrap(page, "Toffee Maw");
        await tap(maw.locator(".combatant-name"), 900);
        await focus(await listColumn(page), { padding: 0 });
        await hold(3500);
        await type(maw.getByPlaceholder("amt"), "12");
        await hold(800);
        await tap(maw.getByRole("button", { name: "Dmg" }), 400);
        if ((await hpOf(page, "Toffee Maw").inputValue()) !== "33") throw new Error("The Toffee Maw should be at 33 HP.");
        await hold(3500);
        // The steppers beside the box: two taps up, which the app debounces into one write.
        await tap(maw.locator(".hp-btn").last(), 700);
        await tap(maw.locator(".hp-btn").last(), 700);
        await hold(5500);
      },
    },
    {
      id: "run-attack",
      caption: "Monsters attack from their stat block",
      narration:
        "Click a monster and its stat block opens beside the list. Every attack and save on it rolls from the structure, not the text. Press Attack and choose a target. The runner shows the armour class it is rolling against, and any advantage or disadvantage and why. Roll the attack, roll the damage, and apply it. The hero's hit points drop in the list.",
      async run({ page, tap, hold, focus }) {
        const panel = page.locator(".panel-shell");
        await focus(panel, { padding: 0 });
        await hold(3000);
        await scrollPanel(page, 700, 1100);
        await hold(1500);
        await tap(page.getByTestId("use-Sticky Pull-Attack"), 900);
        await hold(3500);
        // The dice are seeded, but how many rolls the app makes before this one is not fixed. Fixing this roll makes the
        // d20 a 15 (a hit on Fresco's AC 15 with +4) and the damage a clean 9, through the app's own roll path.
        await page.evaluate(() => {
          Math.random = () => 0.72;
        });
        await tap(panel.getByRole("button", { name: /Roll attack/ }), 2200);
        await hold(2500);
        await tap(panel.getByRole("button", { name: /Roll damage/ }), 1800);
        await hold(1500);
        await tap(panel.getByRole("button", { name: /^Apply to Fresco/ }), 600);
        await focus(await listColumn(page), { padding: 0 });
        await hold(3500);
        if (Number(await hpOf(page, "Fresco").inputValue()) >= 51) throw new Error("Fresco should have taken damage.");
      },
    },
    {
      id: "run-conditions",
      caption: "Conditions, with their own duration",
      narration:
        "Conditions live on each row. Click the plus, pick Poisoned, and it becomes a badge. Open the badge to say what ends it: the start or end of a turn, a number of rounds, or a saving throw each turn. The runner then reminds you when a roll is due. The cross removes it.",
      async run({ page, tap, hold, focus }) {
        const fresco = wrap(page, "Fresco");
        await focus(await listColumn(page), { padding: 0 });
        await hold(2500);
        // The picker's button says "Add or remove conditions" closed and "Close condition picker" open.
        const plus = fresco.locator(".condition-picker-wrap button");
        await tap(plus, 2500);
        await tap(page.getByRole("dialog", { name: "Conditions" }).getByRole("button", { name: "Poisoned", exact: true }), 800);
        await fresco.getByRole("button", { name: "Edit Poisoned" }).waitFor({ timeout: 8_000 });
        await tap(plus, 1500);
        await tap(fresco.getByRole("button", { name: "Edit Poisoned" }), 800);
        await hold(5500);
        await tap(page.getByRole("button", { name: "Cancel", exact: true }), 1200);
        await tap(fresco.getByRole("button", { name: "Remove Poisoned" }), 800);
        await hold(3500);
      },
    },
    {
      id: "run-spawn",
      caption: "Reinforcements mid-fight",
      narration:
        "At the foot of the list, Spawn Combatant brings in reinforcements. Pick a Monster or an NPC, a Faction and a Count, press Add, and they join the order with their initiative rolled for you. Your own notes on the encounter sit just below, under DM notes.",
      async run({ page, tap, hold, focus }) {
        await tap(page.locator(".detail-close").first(), 800);
        const spawn = page.locator(".spawn-panel");
        await spawn.scrollIntoViewIfNeeded();
        await focus(spawn, { padding: 60 });
        await hold(3000);
        // Opening the form only shows it; nothing is added.
        await tap(page.getByText("SPAWN COMBATANT"), 800);
        await hold(6500);
        await tap(page.getByText("SPAWN COMBATANT"), 600);
        await hold(2000);
        await focus(null);
      },
    },

    // ── Chapter 4: turns, and what the players see ────────────────────────────────────────────────
    {
      id: "turn-next",
      chapter: "Turns and what your players see",
      caption: "Next Turn, and the table moves on",
      narration:
        "Press Next Turn and the highlight moves down the list. After the last creature, the round counter goes up. A monster at zero hit points is skipped, but a hero is not, because a hero at zero still makes death saves. At the start of each turn that creature's reaction comes back.",
      async run({ page, tap, hold, focus }) {
        // A Hound at zero, to show that the turn order walks past it.
        const hound = wrap(page, "Spun Glass Hound 1");
        await tap(hound.locator(".combatant-name"), 900);
        await hound.getByPlaceholder("amt").fill("20");
        await tap(hound.getByRole("button", { name: "Dmg" }), 600);
        await tap(page.locator(".detail-close").first(), 600);
        await focus(await listColumn(page), { padding: 0 });
        await hold(3000);
        const next = page.getByRole("button", { name: "Next Turn", exact: true });
        // Toffee Maw is up; the order from here is Fresco, Chicory, Rosie, the Sentry, then Vellum (the Hound is skipped).
        for (const name of ["Fresco", "Chicory", "Rosetta", "Marzipan Sentry", "Vellum Ochre"]) {
          await tap(next, 400);
          await waitActive(page, name);
          await hold(1500);
        }
        await hold(2500);
      },
    },
    {
      id: "players-order",
      account: "player",
      device: "phone",
      caption: "Your players follow on their phones",
      narration:
        "Now the other side of the table. This is a player's phone, and its Encounter panel follows the same fight. It shows the round, whose turn it is, and the order, with each hero's health and conditions. Monsters you have revealed appear by name and portrait. One you are holding back is simply not on the list.",
      startAt: "/play/encounter",
      async run({ page, hold, scroll, settled }) {
        await page.getByText("ROUND", { exact: false }).first().waitFor({ timeout: 20_000 });
        await settled();
        await hold(5000);
        await scroll(260, 1800);
        await hold(5000);
        await scroll(-260, 1500);
        await hold(4000);
      },
    },
    {
      id: "players-turn",
      account: "player",
      device: "phone",
      caption: "YOUR TURN!",
      narration:
        "When the turn comes round to a player, the phone says so. YOUR TURN, with a chime if they have chimes switched on. Watch the round tick over as the DM works down the list.",
      async run({ page, offstage, hold }) {
        const dm = await offstage("dm");
        // The DM's other browser opens the live fight and steps the order to Chicory. The Hound at zero is skipped on
        // the way, and the order wraps into round 2.
        await dm.open(RUN_PATH);
        await dm.page.locator(".combatant-row.is-active").first().waitFor({ timeout: 20_000 });
        await hold(2500);
        for (let i = 0; i < 10; i++) {
          if ((await dm.page.locator(".combatant-row.is-active", { hasText: "Chicory" }).count()) > 0) break;
          await nextTurn(dm.page);
          await hold(1200);
        }
        await page.getByText("YOUR TURN!").first().waitFor({ timeout: 15_000 });
        await hold(5000);
      },
    },
    {
      id: "players-hit",
      account: "player",
      device: "phone",
      caption: "A hit lands. The bar drops live.",
      narration:
        "Then a monster strikes. The DM applies the damage, and that hero's health bar drops on their own screen, live, with nothing to refresh.",
      async run({ page, offstage, hold }) {
        const dm = await offstage("dm");
        // The first health bar on the player's list is the first hero in the order: Fresco, who has the Maw's 9 already.
        const bar = 'parseFloat(document.querySelector(".h-1\\\\.5.w-full > div")?.style.width)';
        const before = Number(await page.evaluate(bar));
        await hold(3000);
        await damage(dm.page, "Fresco", 15);
        // 15 of 51 is about 29 points of the bar: the player's own page, off the DM's, must show it within a few seconds.
        await page.waitForFunction(`${bar} < ${before - 15}`, undefined, { timeout: 8_000 });
        await hold(6000);
      },
    },
    {
      id: "players-health",
      caption: "You decide how much health they see",
      narration:
        "How much health they see is your call. In the campaign settings, Health visibility has three choices. Strategic shows bars, exact numbers for heroes, and a word like Bloodied for monsters. Immersive keeps heroes to a bar and monsters to a word. Unknown shows no health at all.",
      // The live fight sits in the database, so leaving the runner loses nothing: the next shot opens it again.
      startAt: "/campaign/settings",
      async run({ page, scrollTo, focus, hold }) {
        const label = page.getByText("HEALTH VISIBILITY", { exact: true });
        await label.waitFor({ timeout: 20_000 });
        await hold(2000);
        await scrollTo(label, 1200, 90);
        await focus(label.locator("xpath=ancestor::div[1]"), { padding: 24 });
        await hold(12000);
        await focus(null);
        await hold(2500);
      },
    },

    // ── Chapter 5: ending the fight ───────────────────────────────────────────────────────────────
    {
      id: "end",
      chapter: "Ending the fight",
      caption: "End Combat saves the results",
      narration:
        "When the last monster falls, press End Combat and confirm. Grimoire writes each hero's hit points, conditions and death saves back to their character sheet, so the next fight starts where this one ended. Abandon, beside it, ends the fight without saving anything, for when it never really happened. That is a whole fight, from the builder to the last turn.",
      startAt: RUN_PATH,
      async run({ page, tap, hold, focus }) {
        await page.getByText(/Round \d/).first().waitFor({ timeout: 20_000 });
        await hold(2000);
        await focus(page.getByRole("button", { name: "End Combat" }), { padding: 160 });
        await hold(5500);
        await tap(page.getByRole("button", { name: "End Combat" }), 900);
        await hold(2500);
        // The confirm is a danger dialog (role alertdialog), so the button is found on the page, not inside a "dialog".
        await tap(page.getByRole("button", { name: "Confirm", exact: true }).filter({ visible: true }).first(), 800);
        // End Combat writes the heroes back, then lands on the encounter's own page.
        await page.waitForURL((url) => !url.pathname.endsWith("/run"), { timeout: 20_000 });
        await focus(null);
        await hold(8000);
      },
    },
  ],
};
