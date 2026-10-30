import { setupWorkshopDm } from "../setup/workshop.ts";
import type { Page } from "playwright";
import type { Episode } from "../types.ts";

/** A recipe's row on the DM's Workshop list, with its reveal button. */
function recipeRow(page: Page, name: string) {
  return page
    .locator("div")
    .filter({ has: page.getByText(name, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: /Hidden|player|party/ }) })
    .last();
}

/** The DM's side of the Workshop. Its pair, `workshop-player`, is the player crafting the recipe shared here. */
export const workshopDm: Episode = {
  id: "workshop-dm",
  title: "The Workshop: recipes your table can craft",
  pairedWith: "workshop-player",
  account: "dm",
  setup: setupWorkshopDm,
  shots: [
    {
      id: "invention",
      caption: "Your players invent. You decide.",
      narration:
        "Your players can invent things. Here Chicory wants a night-light for the bakery loft, made from leftover candy-glass. It arrives as a full recipe, with the rules written out.",
      startAt: "/crafting",
      async run({ page, hold, scrollTo }) {
        await hold(1800);
        await scrollTo(page.getByRole("article", { name: "Sugar-Glass Night-Light" }), 1200, 70);
        await hold(1500);
        await scrollTo(page.getByRole("button", { name: "Approve" }), 1600, 380);
        await hold(1200);
      },
    },
    {
      id: "approve",
      caption: "Approve it and it is real",
      narration: "Nothing joins your world until you approve it. Approve, and it becomes a recipe your table can craft.",
      async run({ page, tap, hold }) {
        await tap(page.getByRole("button", { name: "Approve" }), 2400);
        await hold(800);
      },
    },
    {
      id: "recipes",
      caption: "Every recipe your table can craft",
      narration: "Every recipe in your campaign lives in the Workshop: what it takes, how hard it is, and what it makes.",
      async run({ page, hold, scrollTo }) {
        await scrollTo(recipeRow(page, "Moonflower Essence"), 1600, 260);
        await hold(1800);
      },
    },
    {
      id: "reveal",
      caption: "Share it with one player, or all",
      narration: "When the party finds the notebook, share the recipe with whoever earned it. It shows up in their Workshop right away.",
      async run({ page, tap, hold }) {
        await tap(recipeRow(page, "Moonflower Essence").getByRole("button", { name: /Hidden/ }), 1400);
        await tap(page.getByText("Chicory", { exact: true }).last(), 1600);
        await page.keyboard.press("Escape");
        await hold(1800);
      },
    },
  ],
};
