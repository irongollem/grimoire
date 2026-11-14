import { QUEST_PATH, setupQuests, teardownQuests } from "../setup/quests.ts";
import type { Locator, Page } from "playwright";
import type { Episode, ShotContext } from "../types.ts";

/**
 * Points the camera at a rectangle that no single element covers. An invisible fixed box is laid over the area,
 * the camera frames it, and the box is removed once the glide has started; the camera keeps its target after that.
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

/** The drawer's head for the beat titled `title`: its title, the three circles of what players know, and the marks. */
async function focusBeatHead(page: Page, focus: ShotContext["focus"], title: string): Promise<void> {
  const heading = await page.getByRole("heading", { name: title, level: 2 }).boundingBox();
  const failed = await page.getByRole("checkbox", { name: "Failed" }).first().boundingBox();
  if (!heading || !failed) throw new Error(`The drawer does not show ${title}.`);
  const x = heading.x - 16;
  await focusArea(page, focus, { x, y: heading.y - 60, width: 1440 - x - 8, height: failed.y + failed.height + 24 - (heading.y - 60) });
}

/**
 * Scrolls the drawer, not the canvas. The recorder's own scroll wheels at the middle of the screen, which on this
 * page is the story flow, where a wheel pans and zooms.
 */
async function wheelDrawer(page: Page, over: Locator, dy: number, ms = 900): Promise<void> {
  const box = await over.boundingBox();
  if (!box) throw new Error("wheelDrawer: the drawer is not on the page.");
  await page.mouse.move(box.x + box.width / 2, Math.min(box.y + box.height / 2, 700), { steps: 10 });
  const steps = Math.max(1, Math.round(ms / 16));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(250);
}

/**
 * The DM running a quest on a laptop, on the one quest screen (#1183, #1194): the story flow with a drawer beside it.
 * Its pair, `quests-player`, is the same quest in a player's Journal.
 */
export const questsDm: Episode = {
  id: "quests-dm",
  title: "Quests: the story in front of you",
  pairedWith: "quests-player",
  account: "dm",
  device: "desktop",
  setup: setupQuests,
  teardown: teardownQuests,
  seed: 5,
  shots: [
    {
      id: "flow",
      caption: "The whole story on one screen",
      narration: "Open a quest and the whole story is on one screen. Pick a beat, and the drawer beside it has the Read aloud for the scene.",
      // Read when the shot opens, not at import: the registry loads every episode, and the id is looked up in the demo copy.
      get startAt() {
        return QUEST_PATH();
      },
      async run({ page, tap, hold, focus, settled }) {
        const node = page.getByText("Sister Ribbon's Offer").first();
        await node.waitFor({ timeout: 20_000 });
        await settled();
        await hold(2200);
        await tap(node, 1200);
        await focus(page.getByRole("region", { name: "Read aloud" }), { padding: 40 });
        await hold(5600);
      },
    },
    {
      id: "here",
      caption: "The party arrives, and players see it",
      narration: "Tick Party here. Arriving reveals the beat to your players, so there is nothing to share by hand.",
      async run({ page, tap, hold, focus }) {
        await focusBeatHead(page, focus, "Sister Ribbon's Offer");
        await hold(1400);
        await tap(page.getByRole("checkbox", { name: "Party here" }).first(), 600);
        await page.getByRole("button", { name: "revealed", exact: true, pressed: true }).filter({ visible: true }).first().waitFor({ timeout: 20_000 });
        await hold(2600);
        await focus(null);
        await page.getByText("Party is here", { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 20_000 });
        await hold(2400);
      },
    },
    {
      id: "take",
      caption: "Take a route, see its payoff",
      narration: "Under Where it can go, press Take. The Advance dialog shows the route and its payoff: this one completes an objective.",
      async run({ page, tap, hold, focus }) {
        const ways = page.getByRole("region", { name: "Where it can go" });
        await wheelDrawer(page, page.getByRole("region", { name: "Read aloud" }), 900, 1200);
        await focus(ways, { padding: 40 });
        await hold(1800);
        await tap(ways.getByRole("button", { name: /^Take / }).first(), 1300);
        await focus(page.getByRole("dialog"), { padding: 20 });
        await hold(4600);
      },
    },
    {
      id: "move",
      caption: "Advance, and the story moves on",
      narration: "Press Advance, and the party moves on to The Sealed Door. Your players see it the moment the party arrives.",
      async run({ page, tap, hold, focus }) {
        await tap(page.getByRole("button", { name: "Advance", exact: true }).last(), 900);
        await page.getByRole("dialog").waitFor({ state: "detached", timeout: 20_000 });
        await focus(null);
        await tap(page.getByRole("button", { name: "Go to the current beat" }), 1400);
        await tap(page.getByRole("region", { name: "Where it can go" }).getByText("The Sealed Door").first(), 900);
        await page.getByRole("heading", { name: "The Sealed Door", level: 2 }).waitFor({ timeout: 20_000 });
        await focusBeatHead(page, focus, "The Sealed Door");
        await hold(3400);
      },
    },
  ],
};
