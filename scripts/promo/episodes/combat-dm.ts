import type { Page } from "playwright";
import { closeSoundboard, combatantWrap, listColumn, openRunner, RUN_PATH, setInitiatives, setupCombat, teardownCombat } from "../setup/combat.ts";
import type { Episode } from "../types.ts";

/** Turn order the Reel reads well with: the Toffee Maw leads, a hero follows, and the hounds trail. */
const ORDER = {
  "Toffee Maw": 21,
  Fresco: 18,
  Chicory: 16,
  "Rosetta \"Rosie\" Vermeil": 14,
  "Marzipan Sentry": 12,
  "Spun Glass Hound 1": 11,
  "Vellum Ochre": 9,
  "Spun Glass Hound 2": 8,
  "Toddy Bellows": 6,
};

const wrap = combatantWrap;

/** The HP box of a row. */
function hpOf(page: Page, name: string) {
  return wrap(page, name).locator(".hp-cell input").first();
}

/** Scrolls the stat block panel (its own scroller, not the page) smoothly. */
async function scrollPanel(page: Page, dy: number, ms = 800): Promise<void> {
  const box = await page.locator(".panel-shell").boundingBox();
  if (!box) throw new Error("The stat block panel is not open.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const steps = Math.round(ms / 16);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(250);
}

/** The DM running combat on a laptop. Its pair, `combat-player`, is the same fight on the player's phone. */
export const combatDm: Episode = {
  id: "combat-dm",
  title: "Combat: run the fight from one screen",
  pairedWith: "combat-player",
  account: "dm",
  device: "desktop",
  setup: setupCombat,
  teardown: teardownCombat,
  seed: 11,
  async prepare({ offstage }) {
    // The fight is already under way when the Reel opens: the DM's other browser lobbies it, sets the order and
    // starts combat, and leaves the runner so the filmed page picks the live fight up from the database.
    const dm = await offstage("dm");
    await openRunner(dm);
    await dm.page.getByRole("button", { name: "Go Live" }).click();
    await dm.page.locator(".go-live-btn.live-active").waitFor({ timeout: 20_000 });
    await dm.page.waitForTimeout(1500);
    await setInitiatives(dm.page, ORDER);
    await dm.page.getByRole("button", { name: "Start Combat" }).click();
    await dm.page.getByText("Round 1").first().waitFor({ timeout: 20_000 });
    await dm.page.waitForTimeout(1500);
    await closeSoundboard(dm.page);
    await dm.page.goto(`${dm.base}/npcs`);
    await dm.page.waitForTimeout(1500);
  },
  shots: [
    {
      id: "order",
      caption: "Everyone in turn order, at a glance",
      narration: "Combat opens on the initiative list. Heroes and monsters in turn order, with hit points and armor class, and the active turn lit up.",
      startAt: RUN_PATH,
      async run({ page, hold, focus, settled }) {
        await page.getByText("Round 1").first().waitFor({ timeout: 20_000 });
        await settled();
        await focus(await listColumn(page), { padding: 0 });
        await hold(4200);
      },
    },
    {
      id: "damage",
      caption: "Damage in one tap",
      narration: "Click the Toffee Maw, type the damage and press Dmg. Its hit points drop at once.",
      async run({ page, tap, type, hold, focus }) {
        const maw = wrap(page, "Toffee Maw");
        await tap(maw.locator(".combatant-name"), 900);
        await focus(await listColumn(page), { padding: 0 });
        await hold(700);
        await type(maw.getByPlaceholder("amt"), "12");
        await hold(500);
        await tap(maw.getByRole("button", { name: "Dmg" }), 400);
        if ((await hpOf(page, "Toffee Maw").inputValue()) !== "33") throw new Error("The Toffee Maw should be at 33 HP.");
        await hold(2200);
      },
    },
    {
      id: "attack",
      caption: "Monsters attack from their stat block",
      narration: "Open its actions and press Attack. Roll to hit, roll the damage, and apply it to the hero it struck.",
      async run({ page, tap, hold, focus }) {
        const panel = page.locator(".panel-shell");
        await focus(panel, { padding: 0 });
        await hold(600);
        await scrollPanel(page, 700, 1100);
        await hold(500);
        await tap(page.getByTestId("use-Sticky Pull-Attack"), 900);
        // The dice are seeded, but how many rolls the app makes before this one is not fixed. Fixing this roll makes the
        // d20 a 15 (a hit on Fresco's AC 15 with +4) and the damage a clean 9, through the app's own roll path.
        await page.evaluate(() => {
          Math.random = () => 0.72;
        });
        await tap(panel.getByRole("button", { name: /Roll attack/ }), 1800);
        await hold(700);
        await tap(panel.getByRole("button", { name: /Roll damage/ }), 1500);
        await tap(panel.getByRole("button", { name: /^Apply to Fresco/ }), 600);
        await focus(await listColumn(page), { padding: 0 });
        await hold(2400);
        if (Number(await hpOf(page, "Fresco").inputValue()) >= 51) throw new Error("Fresco should have taken damage.");
      },
    },
    {
      id: "next",
      caption: "Next Turn, and the table moves on",
      narration: "Press Next Turn and the highlight moves down the list, to Fresco.",
      async run({ page, tap, hold, focus }) {
        await tap(page.locator(".detail-close").first(), 600);
        await focus(await listColumn(page), { padding: 0 });
        await hold(1200);
        await tap(page.getByRole("button", { name: "Next Turn ›" }), 600);
        await page.locator(".combatant-row.is-active", { hasText: "Fresco" }).waitFor({ timeout: 5_000 });
        await hold(3000);
      },
    },
  ],
};
