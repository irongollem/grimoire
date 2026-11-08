import { LETTER_ID, setupHandouts, teardownHandouts } from "../setup/handouts.ts";
import type { Episode } from "../types.ts";

/** The DM's laptop: a letter on its paper, a new one started from the picker, and the letter handed to the party. */
export const handoutsDm: Episode = {
  id: "handouts-dm",
  title: "Handouts: write it once, hand it to the table",
  pairedWith: "handouts-player",
  account: "dm",
  device: "desktop",
  setup: setupHandouts,
  teardown: teardownHandouts,
  seed: 5,
  shots: [
    {
      id: "letter",
      caption: "A handout, on its own paper",
      narration: "Here is a handout: a letter from the Lighthouse Keeper, laid out on its page, in the look of the Letter paper.",
      startAt: `/scriptorium/${LETTER_ID}`,
      async run({ page, hold, focus, settled }) {
        await page.waitForSelector(".pagedjs_page", { timeout: 30_000 });
        await settled();
        await hold(1500);
        // The page is tall and the window is wide: frame the writing itself, with a margin of paper, not the whole sheet.
        const text = page.locator(".pagedjs_page").filter({ visible: true }).first().locator(".pagedjs_page_content p").nth(1);
        await focus(text, { padding: 150 });
        await hold(4500);
      },
    },
    {
      id: "paper",
      caption: "New handout: pick a paper",
      narration: "To start your own, press New handout. It asks what it is written on: Letter, Notice, Journal page or Plain page. Pick Letter and it opens at once.",
      startAt: "/scriptorium",
      async run({ page, tap, hold, focus, settled }) {
        await settled();
        await tap(page.getByRole("button", { name: "New handout" }), 900);
        const picker = page.getByRole("dialog", { name: "New handout" });
        await picker.waitFor();
        await focus(picker);
        await hold(2800);
        // Pick Letter here and wait for the editor, so the next shot opens on the editor and not on the route loading.
        await tap(picker.locator('[data-paper="letter"]'), 300);
        await page.locator(".ProseMirror[contenteditable=true]").first().waitFor({ timeout: 30_000 });
        await settled();
      },
    },
    {
      id: "write",
      caption: "It saves itself as you type",
      narration: "Just write. The handout saves itself as you type, so there is nothing to press.",
      async run({ page, tap, type, hold, focus }) {
        await focus(null);
        const editor = page.locator(".ProseMirror[contenteditable=true]").first();
        await hold(500);
        await tap(editor, 400);
        // No sidebar on this page, so the view may start at its left edge.
        await focus(editor.locator("p").first(), { padding: 150, leftInset: 0 });
        await type(editor, "Dear friend, come at dusk.");
        // The editor saves itself a moment after the last key.
        await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15_000 });
        await focus(page.getByText("Saved", { exact: true }).first(), { padding: 220 });
        await hold(1800);
        // An empty handout has no page to lay out; the preview draws one as soon as there are words.
        await page.waitForSelector(".pagedjs_page", { timeout: 30_000 });
        await focus(page.locator(".pagedjs_page").filter({ visible: true }).first().locator(".pagedjs_page_content p").first(), { padding: 150 });
        await hold(2800);
      },
    },
    {
      id: "give",
      caption: "Give to players",
      narration: "When the letter is ready, press Give to players. Tick who gets it, or pick Whole party, and press Give it.",
      startAt: `/scriptorium/${LETTER_ID}`,
      async run({ page, tap, hold, focus, settled }) {
        await page.waitForSelector(".pagedjs_page", { timeout: 30_000 });
        await settled();
        await hold(800);
        await tap(page.getByRole("button", { name: "Give to players" }), 1200);
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        await focus(dialog);
        await hold(1200);
        await tap(dialog.getByRole("button", { name: "Whole party" }), 1500);
        await hold(1500);
        await tap(dialog.getByRole("button", { name: "Give it" }), 800);
        await dialog.waitFor({ state: "detached" });
        const toast = page.getByText("Given to 5 players.").first();
        await toast.waitFor();
        await hold(500);
        await focus(toast, { padding: 120 });
        await hold(2200);
        // The line's own box spans the page; its words are the span inside.
        await focus(page.getByTestId("audience-line").getByText("With the whole party"), { padding: 150, leftInset: 0 });
        await hold(3000);
      },
    },
  ],
};
