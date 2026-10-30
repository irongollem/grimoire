import { setupWorkshopPlayer } from "../setup/workshop.ts";
import type { Page } from "playwright";
import type { Episode } from "../types.ts";

/** The Moonflower Essence card on the player's Workshop list (cards are plain divs). */
function recipeCard(page: Page) {
  return page
    .locator("div")
    .filter({ has: page.getByText("Moonflower Essence", { exact: true }) })
    .filter({ has: page.getByText("Open workbench") })
    .last();
}

/** The player at the crafting workbench. Its pair, `workshop-dm`, is the DM writing and sharing the recipe. */
export const workshopPlayer: Episode = {
  id: "workshop-player",
  title: "The Workshop: crafting at the bench",
  pairedWith: "workshop-dm",
  account: "player",
  setup: setupWorkshopPlayer,
  seed: 7,
  shots: [
    {
      id: "recipes",
      caption: "Your DM shares recipes with you",
      narration:
        "When your DM shares a recipe, it lands in your Workshop. Every card tells you what you have and what you still need.",
      startAt: "/play/crafting",
      async run({ page, hold, scrollTo }) {
        await hold(1500);
        await scrollTo(recipeCard(page), 1400);
        await hold(2500);
      },
    },
    {
      id: "bench",
      caption: "Every ingredient has its own dish",
      narration: "Open the workbench. Your alchemist's bench is laid out with a dish for every ingredient, already filled from your pack.",
      async run({ page, tap, hold, scroll }) {
        const card = recipeCard(page);
        await tap(card.getByText("Open workbench"), 2600);
        await scroll(300, 1100);
        await hold(2000);
      },
    },
    {
      id: "ledger",
      caption: "The ledger spells out every rule",
      narration: "The ledger spells out the rules: the DC, the time, your roll, your tools. Tick off a proper lab for the bonus.",
      async run({ page, tap, hold, scroll }) {
        await scroll(420, 1100);
        await hold(900);
        await tap(page.getByText("Proper alchemist's lab available"), 1400);
      },
    },
    {
      id: "roll",
      caption: "Roll it, and hear it",
      narration: "Then roll. The bench sounds like work while the dice decide.",
      async run({ page, tap, hold }) {
        await tap(page.getByRole("button", { name: "Attempt craft" }), 400);
        await page.getByText("Posted to the campaign chat.").waitFor({ timeout: 15_000 });
        await hold(2200);
      },
    },
    {
      id: "result",
      caption: "Success lands in your pack",
      narration: "A success spends the ingredients and puts the essence in your pack. Miss, and your main ingredient loses a step of quality. Roll a one, and it is ruined.",
      async run({ hold }) {
        await hold(3500);
      },
    },
  ],
};
