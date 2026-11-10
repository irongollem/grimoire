import { QUEST_PATH, setupQuests, startThread, teardownQuests } from "../setup/quests.ts";
import type { Page } from "playwright";
import type { Episode, ShotContext } from "../types.ts";

/**
 * Points the camera at a rectangle that no single element covers (the cockpit's cards are as wide as the page,
 * so focusing one barely zooms). An invisible fixed box is laid over the area, the camera frames it, and the box
 * is removed once the glide has started; the camera keeps its target after that.
 */
async function focusArea(page: Page, focus: ShotContext["focus"], rect: { x: number; y: number; width: number; height: number }): Promise<void> {
  // Page code goes in as strings: the scripts' tsconfig has no DOM types.
  const css = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;opacity:0`;
  await page.evaluate(`(() => {
    document.getElementById("promo-focus")?.remove();
    const box = document.createElement("div");
    box.id = "promo-focus";
    box.style.cssText = ${JSON.stringify(css)};
    document.body.append(box);
  })()`);
  await focus(page.locator("#promo-focus"), { padding: 0 });
  await page.evaluate(`document.getElementById("promo-focus")?.remove()`);
}

/** The top of the beat card: its title and the Read aloud box, left-aligned so the first lines are big enough to read. */
async function focusReadAloud(page: Page, focus: ShotContext["focus"]): Promise<void> {
  const card = await page.locator("article").filter({ hasText: "Read aloud" }).first().boundingBox();
  if (!card) throw new Error("The beat card is not on screen.");
  await focusArea(page, focus, { x: card.x, y: card.y + 4, width: 810, height: 262 });
}

/** The DM running a quest on a laptop. Its pair, `quests-player`, is the same quest in a player's Journal. */
export const questsDm: Episode = {
  id: "quests-dm",
  title: "Quests: the story in front of you",
  pairedWith: "quests-player",
  account: "dm",
  device: "desktop",
  setup: setupQuests,
  teardown: teardownQuests,
  seed: 5,
  async prepare({ offstage }) {
    // The thread is already started when the Reel opens: the DM's other browser pressed Start here.
    await startThread(await offstage("dm"));
  },
  shots: [
    {
      id: "beat",
      caption: "The scene in front of you, ready to read",
      narration: "Open a quest and press Run. The Session Cockpit shows where the party is, and the Read aloud for the scene in front of you.",
      // Read when the shot opens, not at import: the registry loads every episode, and the id is looked up in the demo copy.
      get startAt() {
        return QUEST_PATH();
      },
      async run({ page, hold, focus, settled }) {
        await page.getByText("Read aloud").first().waitFor({ timeout: 20_000 });
        await settled();
        await hold(1000);
        await focusReadAloud(page, focus);
        await hold(5200);
      },
    },
    {
      id: "reveal",
      caption: "Reveal it to your players",
      narration: "Press Reveal to players, confirm, and the beat is in their Story so far.",
      async run({ page, tap, hold, focus }) {
        const button = page.getByRole("button", { name: "Reveal to players" }).first();
        await focus(null);
        await hold(600);
        await tap(button, 900);
        await focus(page.getByRole("alertdialog"), { padding: 30 });
        await hold(2200);
        await tap(page.getByRole("button", { name: "Confirm" }), 900);
        const badge = page.getByText("Visible to players").first();
        await badge.waitFor({ timeout: 20_000 });
        await focus(badge, { padding: 160 });
        await hold(3000);
      },
    },
    {
      id: "choose",
      caption: "Choose what happens next",
      narration: "Under What happens next, press Choose. The Advance dialog shows the route you took and the payoff it fires: this one completes an objective.",
      async run({ page, tap, hold, focus, scrollTo }) {
        await focus(null);
        const heading = page.getByRole("heading", { name: "What happens next" });
        await scrollTo(heading, 1400, 140);
        await hold(600);
        await focus(page.getByRole("region", { name: "What happens next" }), { padding: 30 });
        await hold(1600);
        await tap(page.getByRole("button", { name: "Choose" }).first(), 1500);
        await focus(page.getByRole("dialog"), { padding: 20 });
        await hold(4000);
      },
    },
    {
      id: "advance",
      caption: "Advance, and the story moves on",
      narration: "Press Advance and the story moves to The Sealed Door, with its site ready to run.",
      async run({ page, tap, hold, focus }) {
        await tap(page.getByRole("button", { name: "Advance", exact: true }).last(), 1000);
        await page.getByRole("heading", { name: "The Sealed Door" }).first().waitFor({ timeout: 20_000 });
        await focus(null);
        await hold(700);
        const head = await page.getByRole("heading", { name: "The Sealed Door" }).first().boundingBox();
        if (!head) throw new Error("The Sealed Door header is not on screen.");
        await focusArea(page, focus, { x: head.x - 20, y: head.y - 40, width: 830, height: 500 });
        await hold(4200);
      },
    },
  ],
};
