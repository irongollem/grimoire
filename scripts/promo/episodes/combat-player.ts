import { closeSoundboard, damage, nextTurn, openRunner, RUN_PATH, revealMonster, setInitiatives, setupCombat, teardownCombat } from "../setup/combat.ts";
import type { Episode } from "../types.ts";

const MONSTERS = ["Marzipan Sentry", "Toffee Maw", "Spun Glass Hound 1", "Spun Glass Hound 2"];

/** Everyone but Chicory. Her own roll (a 16) lands between the Marzipan Sentry and the Toffee Maw, so her turn is the second. */
const ORDER = {
  "Marzipan Sentry": 23,
  "Toffee Maw": 14,
  Fresco: 13,
  "Rosetta \"Rosie\" Vermeil": 12,
  "Spun Glass Hound 1": 11,
  "Spun Glass Hound 2": 10,
  "Vellum Ochre": 9,
  "Toddy Bellows": 8,
};

/** The player's phone at the same fight. Its pair, `combat-dm`, is the DM running it on a laptop. */
export const combatPlayer: Episode = {
  id: "combat-player",
  title: "Combat: your turn, on your phone",
  pairedWith: "combat-dm",
  account: "player",
  device: "phone",
  setup: setupCombat,
  teardown: teardownCombat,
  seed: 4,
  async prepare({ offstage }) {
    // The DM's other browser opens the lobby: live, the monsters revealed, everyone's roll in but Chicory's.
    const dm = await offstage("dm");
    await openRunner(dm);
    await dm.page.getByRole("button", { name: "Go Live" }).click();
    await dm.page.locator(".go-live-btn.live-active").waitFor({ timeout: 20_000 });
    await dm.page.waitForTimeout(1500);
    for (const name of MONSTERS) await revealMonster(dm.page, name);
    await setInitiatives(dm.page, ORDER);
    await dm.page.waitForTimeout(1200);
    await closeSoundboard(dm.page);
  },
  shots: [
    {
      id: "lobby",
      caption: "Roll initiative from your phone",
      narration: "While the table gathers, you roll your own initiative. One tap, and you see what you rolled.",
      startAt: "/play/encounter",
      async run({ page, offstage, tap, hold, settled }) {
        const dm = await offstage("dm");
        await page.getByText("Gathering Party").first().waitFor({ timeout: 20_000 });
        await settled();
        await hold(1800);
        // The dice are seeded, but how many rolls come before this one is not fixed: this d20 is a 15.
        await page.evaluate(() => {
          Math.random = () => 0.7;
        });
        await tap(page.getByRole("button", { name: "Roll initiative" }), 1500);
        await page.getByText(/You rolled \d+/).first().waitFor({ timeout: 15_000 });
        const rolled = Number((await page.getByText(/You rolled \d+/).first().innerText()).match(/\d+/)![0]);
        if (rolled <= ORDER["Toffee Maw"] || rolled >= ORDER["Marzipan Sentry"]) throw new Error(`Chicory rolled ${rolled}, which does not land between the Maw and the Sentry.`);
        // The DM's runner does not pick up a player's roll while it stays open (see the report), so the DM's
        // browser reopens it, which reads the rolls made so far, while the player looks at her number.
        await dm.page.goto(`${dm.base}${RUN_PATH}`);
        await dm.page.waitForFunction(
          `[...document.querySelectorAll("input")].some((i) => i.getAttribute("aria-label")?.startsWith("Initiative for Chicory") && i.value === "${rolled}")`,
          undefined,
          { timeout: 20_000 },
        );
        await hold(1800);
      },
    },
    {
      id: "fight",
      caption: "Combat begins. See who is up.",
      narration: "Then your DM starts combat. You see the round, who is up, and how everyone is holding out.",
      async run({ page, offstage, hold, scroll }) {
        const dm = await offstage("dm");
        await dm.page.getByRole("button", { name: "Start Combat" }).click();
        if (await dm.page.getByRole("dialog").count()) throw new Error("The DM was asked to roll for someone: an initiative did not land.");
        await dm.page.getByText("Round 1").first().waitFor({ timeout: 20_000 });
        await page.getByText("ROUND", { exact: false }).first().waitFor({ timeout: 15_000 });
        await hold(2200);
        await scroll(260, 1200);
        await hold(2000);
      },
    },
    {
      id: "turn",
      caption: "YOUR TURN!",
      narration: "When the turn comes round to you, your phone lets you know.",
      async run({ page, offstage, hold, scroll }) {
        const dm = await offstage("dm");
        await scroll(-400, 700);
        await hold(600);
        await nextTurn(dm.page);
        await page.getByText("YOUR TURN!").first().waitFor({ timeout: 15_000 });
        await hold(3500);
      },
    },
    {
      id: "hit",
      caption: "Toffee Maw bites. Your bar drops live.",
      narration: "Then the Toffee Maw bites. Your DM applies the damage, and your health bar drops on your own screen.",
      async run({ page, offstage, hold }) {
        const dm = await offstage("dm");
        await nextTurn(dm.page);
        await hold(1200);
        // Chicory is the first hero in the order, so hers is the first health bar on the list: it must be full.
        const bar = 'document.querySelector(".h-1\\\\.5.w-full > div")?.style.width';
        if (parseFloat(String(await page.evaluate(bar))) < 99) throw new Error("Chicory's bar should start full.");
        await damage(dm.page, "Chicory", 18);
        // 27 of 45 left: the player's own page, off the DM's, must show it within a few seconds, or this take fails.
        await page.waitForFunction(`parseFloat(${bar}) < 75`, undefined, { timeout: 8_000 });
        await hold(3500);
      },
    },
  ],
};
