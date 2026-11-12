import type { Page } from "playwright";
import { LETTER_TITLE } from "../setup/handouts.ts";
import { NEW_BOOK_TITLE, setupYtScriptorium, teardownYtScriptorium } from "../setup/yt-scriptorium.ts";
import type { Episode } from "../types.ts";

type Target = ReturnType<Page["locator"]>;

/** The alt text of the keeper's sketch in the letter (`setup/handouts.ts`). */
const KEEPER_SKETCH = "The keeper's sketch of a glass hound on the rocks";

/**
 * Puts the caret at the end of a whole paragraph by clicking past the end of its last line, as a person would. The End
 * key reaches only the end of the visual line, and a selection set from script never reached the editor: the next key
 * still landed where the earlier click had put the caret, splitting the paragraph mid-word.
 */
async function caretToEnd(page: Page, paragraph: Target): Promise<void> {
  const box = await paragraph.boundingBox();
  if (!box) throw new Error("caretToEnd: the paragraph is not on the page.");
  const x = box.x + box.width - 4;
  const y = box.y + box.height - 8;
  await page.mouse.move(x, y, { steps: 15 });
  await page.mouse.click(x, y);
  await page.waitForTimeout(250);
}

/** Glides the pointer onto a target over `ms`, so a hover reads as a hand moving and not a jump. */
async function glideTo(page: Page, target: Target, ms = 700): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error("glideTo: the target is not on the page.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: Math.max(1, Math.round(ms / 16)) });
}

/** Drags a range input's thumb from where it stands to `to`, so the slider is seen to move. */
async function dragRange(page: Page, slider: Target, to: number): Promise<void> {
  const box = await slider.boundingBox();
  if (!box) throw new Error("dragRange: the slider is not on the page.");
  const min = Number(await slider.getAttribute("min"));
  const max = Number(await slider.getAttribute("max"));
  const from = Number(await slider.inputValue());
  // The thumb is about 16px wide, so its centre travels the track less one thumb.
  const at = (v: number) => box.x + 8 + (box.width - 16) * ((v - min) / (max - min));
  const y = box.y + box.height / 2;
  await page.mouse.move(at(from), y, { steps: 20 });
  await page.mouse.down();
  await page.mouse.move(at(to), y, { steps: 30 });
  await page.mouse.up();
}

/**
 * The DM's laptop for the whole feature, then the player's phone for the one moment the two meet (the letter
 * arriving), then the laptop again for reading and printing. Both accounts are real signed-in fixtures.
 */
export const ytScriptorium: Episode = {
  id: "yt-scriptorium",
  title: "Scriptorium: write the book your table holds",
  account: "dm",
  format: "youtube",
  device: "desktop",
  setup: setupYtScriptorium,
  teardown: teardownYtScriptorium,
  seed: 11,
  shots: [
    // ── A book of chapters ──────────────────────────────────────────────────────────────────────
    {
      id: "list",
      chapter: "A book of chapters",
      caption: "The Scriptorium",
      narration:
        "This is the Scriptorium, where you write the things your table can hold: a book for you to run from, and letters and notices for your players. Everything here prints, and anything here can be handed over.",
      startAt: "/scriptorium",
      async run({ page, hold, settled, focus }) {
        const card = (title: string) => page.locator("div.group", { hasText: title }).first();
        await card("The Locked Workshop").waitFor();
        await settled();
        await hold(1500);
        await focus(card("The Locked Workshop"), { padding: 140 });
        await hold(4200);
        await focus(card(LETTER_TITLE), { padding: 140 });
        await hold(4500);
        await focus(null);
        await glideTo(page, page.getByRole("button", { name: "New book" }), 1200);
        await hold(2500);
      },
    },
    {
      id: "new-book",
      caption: "New book, from a template",
      narration:
        "Press New book and pick a template. The Adventure Module starts you with its chapters already in place, in the Grimoire look.",
      async run({ page, tap, hold, settled }) {
        await tap(page.getByRole("button", { name: "New book" }), 1200);
        const adventure = page.getByRole("button", { name: /Adventure Module/ });
        await adventure.waitFor();
        await settled();
        await hold(1000);
        await glideTo(page, page.getByRole("button", { name: /Monster Compendium/ }), 900);
        await hold(700);
        await glideTo(page, adventure, 900);
        await hold(900);
        await tap(adventure, 300);
        await page.getByTestId("book-editor").waitFor({ timeout: 30_000 });
        await page.getByRole("heading", { name: NEW_BOOK_TITLE }).waitFor();
        await settled();
        await hold(1500);
      },
    },
    {
      id: "chapters",
      caption: "Chapters",
      narration:
        "Down the left, under Chapters, is the book's list of chapters. Every chapter opens on a right-hand page, so a change in one never moves the pages of another. Drag one to reorder it, or add one at the end.",
      async run({ page, tap, hold }) {
        const rail = page.getByRole("navigation", { name: "Chapters" });
        await rail.waitFor();
        await hold(1800);
        await glideTo(page, rail.getByRole("button", { name: /^Chapter 1/ }), 1000);
        await hold(1800);
        await glideTo(page, rail.getByRole("button", { name: /^Chapter 2/ }), 800);
        await hold(1200);
        await tap(rail.getByRole("button", { name: /^Chapter 2/ }), 3800);
        await glideTo(page, rail.getByRole("button", { name: "Add chapter" }), 1000);
        await hold(3200);
      },
    },

    // ── Writing on the page ─────────────────────────────────────────────────────────────────────
    {
      id: "page",
      chapter: "Writing on the page",
      caption: "The page that prints",
      narration:
        "The page you write on is the page that prints. As the book lays itself out, page breaks, columns and footers appear where the paper will have them.",
      async run({ page, hold, scroll }) {
        // Chapter 2 is the one left open by the last shot. Its first paragraph is the place to add one.
        const editor = page.locator(".ProseMirror[contenteditable=true]").first();
        const para = editor.locator("p", { hasText: "Continue the adventure" }).first();
        await para.waitFor();
        await caretToEnd(page, para);
        await page.keyboard.press("Enter");
        await page.keyboard.type("The workshop door is sugar-glass, cold to the touch, and it hums when the bells ring.", { delay: 60 });
        await hold(1200);
        await scroll(700, 3000);
        await hold(2000);
      },
    },
    {
      id: "kit",
      caption: "The Book kit",
      narration:
        "Under Book kit are the blocks a book is made of. Click Read-aloud, and a boxed passage for you to read at the table lands where you were writing.",
      async run({ page, tap, hold, scroll, scrollTo }) {
        await tap(page.getByRole("button", { name: "Book kit", exact: true }), 1200);
        await page.getByTestId("book-kit").waitFor();
        // Back up to the text the last shot wrote, so the block is seen landing where the caret was.
        await page.mouse.move(960, 450);
        await scroll(-700, 900);
        await glideTo(page, page.getByTestId("kit-tile-Sidebar"), 800);
        await hold(700);
        await tap(page.getByTestId("kit-tile-Read-aloud"), 1200);
        await page.keyboard.type("The lamps are out. Somewhere below, glass rings against glass.", { delay: 60 });
        await scrollTo(page.locator(".ProseMirror p", { hasText: "Somewhere below" }).first(), 900, 260);
        await hold(1200);
      },
    },
    {
      id: "entry",
      caption: "From the campaign",
      narration:
        "Your campaign is in the kit too. Search for Sister Ribbon and click her, and her entry lands on the page, linked to the NPC, so the book keeps up when she changes.",
      async run({ page, tap, type, hold, scroll, scrollTo }) {
        await type(page.getByTestId("kit-search"), "Sister Ribbon");
        await hold(900);
        await tap(page.getByTestId("kit-entry-Sister Ribbon"), 600);
        const entry = page.locator(".sc-entity-embed").first();
        await entry.waitFor();
        await scrollTo(entry, 1200, 230);
        await hold(2500);
        await scroll(380, 2800);
        await hold(1200);
      },
    },

    // ── Pictures on the page ────────────────────────────────────────────────────────────────────
    {
      id: "picture",
      chapter: "Pictures on the page",
      caption: "A picture in the text",
      narration:
        "Under Art, Browse pictures opens your pictures. Pick one and it sits in the text, beside the paragraph it belongs to.",
      async run({ page, tap, hold, scrollTo }) {
        // The picture goes in beside the read-aloud passage, on the first page of the chapter, so it is the page in view.
        const line = page.locator(".ProseMirror p", { hasText: "Somewhere below" }).first();
        await scrollTo(line, 1000, 260);
        await caretToEnd(page, line);
        await tap(page.getByRole("button", { name: "Browse pictures" }), 1200);
        const modal = page.getByRole("dialog");
        await modal.waitFor();
        await tap(modal.getByRole("button", { name: "Document Art" }), 1200);
        await modal.locator("button img").first().waitFor();
        await hold(600);
        await tap(modal.locator("button", { has: page.locator('img[alt="glass-hound.webp"]') }), 300);
        await modal.waitFor({ state: "detached" });
        const hound = page.locator('.ProseMirror img[src*="glass-hound"]');
        await hound.waitFor();
        // The editor scrolls to its caret once the picture has its size, which ended one take on the next page.
        // Let the picture load and the page settle first, then go to it.
        await hound.evaluate("(img) => img.decode()");
        await hold(700);
        await scrollTo(hound, 900, 330);
        await hold(2200);
      },
    },
    {
      id: "behind",
      caption: "Behind the text",
      narration:
        "Select it, and the panel beside the page describes it. Under Layer, choose Behind the text: the picture sinks into the paper and the words run over it. Strength sets how strongly it shows.",
      async run({ page, tap, hold, scrollTo }) {
        await tap(page.locator('.ProseMirror img[src*="glass-hound"]'), 2600);
        await tap(page.getByRole("button", { name: "Behind the text" }), 2600);
        await scrollTo(page.locator("img.sc-furniture--art").first(), 900, 200);
        const strength = page.getByRole("slider", { name: "Strength" });
        await strength.waitFor();
        await dragRange(page, strength, 30);
        await hold(1500);
        await dragRange(page, strength, 60);
        await hold(2500);
      },
    },
    {
      id: "corner",
      caption: "Pinned to a corner",
      narration: "Drag it towards a corner and it snaps flush to the paper's edge, and stays in that corner of the page.",
      async run({ page, tap, hold }) {
        // Two steps out, so the art and the page's bottom-right corner are on screen together.
        await tap(page.getByRole("button", { name: "Zoom out" }), 700);
        await tap(page.getByRole("button", { name: "Zoom out" }), 1000);
        const art = page.locator("img.sc-furniture--art").first();
        const box = await art.boundingBox();
        const sheet = await page.locator(".sc-editor-furniture-page").first().boundingBox();
        if (!box || !sheet) throw new Error("The art or its page is not on screen.");
        const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await page.mouse.move(from.x, from.y, { steps: 20 });
        await hold(500);
        await page.mouse.down();
        await page.mouse.move(sheet.x + sheet.width - 60, sheet.y + sheet.height - 60, { steps: 60 });
        await hold(1500);
        await page.mouse.up();
        await hold(2000);
      },
    },

    // ── The Illuminator ─────────────────────────────────────────────────────────────────────────
    {
      id: "edges",
      chapter: "The Illuminator",
      caption: "Edges and colour",
      narration:
        "Any picture can be treated where it sits. Under Edges, Torn paper tears it out like a cut-out from a sheet, and under Colour, a little warmth makes it sit on the page.",
      async run({ page, tap, hold, scrollTo }) {
        // Back to the page's own size, and the picture back into the text, where a treatment is easy to see.
        await tap(page.getByRole("button", { name: "Zoom in" }), 500);
        await tap(page.getByRole("button", { name: "Zoom in" }), 800);
        await tap(page.getByRole("button", { name: "In the text" }), 1500);
        const hound = page.locator('.ProseMirror img[src*="glass-hound"]');
        await scrollTo(hound, 900, 260);
        await tap(page.getByRole("button", { name: "Torn paper", exact: true }), 600);
        for (const side of ["Top", "Right", "Bottom", "Left"]) await page.getByLabel(side, { exact: true }).check().catch(() => undefined);
        await hold(1500);
        await tap(page.getByRole("button", { name: "Sepia", exact: true }), 1200);
        const warmth = page.getByRole("slider", { name: "Warmth" });
        await warmth.scrollIntoViewIfNeeded();
        await dragRange(page, warmth, 70);
        await hold(1800);
      },
    },
    {
      id: "workbench",
      caption: "More tools: the Illuminator",
      narration:
        "More tools opens the Illuminator: crop, vignette, texture, a paper wash and a point of focus. The original picture is always kept underneath, so any change can be taken back, now or months from now.",
      async run({ page, tap, hold }) {
        await tap(page.getByTestId("panel-open-workbench"), 1000);
        const bench = page.getByTestId("illuminator-workbench");
        await bench.waitFor();
        await hold(1500);
        await tap(bench.getByTestId("tool-crop"), 1500);
        await tap(bench.getByTestId("tool-vignette"), 800);
        await tap(bench.getByRole("switch", { name: "Toggle vignette" }), 600);
        await dragRange(page, bench.locator("aside input[type=range]").first(), 70);
        await hold(1200);
        await tap(bench.getByTestId("tool-focus"), 800);
        await tap(bench.getByRole("switch", { name: "Toggle depth of field" }), 600);
        const stage = bench.getByTestId("workbench-pointer-layer");
        const box = await stage.boundingBox();
        if (!box) throw new Error("The workbench stage is not on screen.");
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45, { steps: 25 });
        await hold(400);
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
        await hold(1800);
        await tap(bench.getByTestId("workbench-done"), 600);
        await bench.waitFor({ state: "detached" });
        await hold(1500);
      },
    },

    // ── Handouts ────────────────────────────────────────────────────────────────────────────────
    {
      id: "new-handout",
      chapter: "Handouts",
      caption: "New handout",
      narration:
        "A handout is a book of one page. Press New handout and pick the paper it is written on: a letter, a notice, a journal page or a plain page.",
      async run({ page, tap, hold, settled }) {
        await page.getByText("Saved", { exact: true }).first().waitFor({ timeout: 15_000 });
        await tap(page.locator("header").getByRole("link", { name: "Scriptorium" }), 600);
        await page.getByRole("button", { name: "New handout" }).waitFor();
        await settled();
        await hold(800);
        await tap(page.getByRole("button", { name: "New handout" }), 1000);
        const picker = page.getByRole("dialog", { name: "New handout" });
        await picker.waitFor();
        const papers = picker.locator("[data-paper]");
        for (let i = 0; i < (await papers.count()); i++) {
          await glideTo(page, papers.nth(i), 600);
          await hold(1100);
        }
        await page.keyboard.press("Escape");
        await picker.waitFor({ state: "detached" });
        await hold(600);
      },
    },
    {
      id: "letter",
      caption: "The keeper's letter",
      narration:
        "Here is a letter the party will want to read, written on its own paper, with the keeper's sketch of what prowls the rocks.",
      async run({ page, tap, hold, settled, scrollTo }) {
        await tap(page.locator("div.group", { hasText: LETTER_TITLE }).locator("a").first(), 600);
        await page.locator(".ProseMirror[contenteditable=true]").first().waitFor({ timeout: 30_000 });
        await settled();
        await hold(2500);
        await scrollTo(page.locator(`.ProseMirror img[alt="${KEEPER_SKETCH}"]`), 2200, 230);
        await hold(3500);
      },
    },
    {
      id: "give",
      caption: "Give to players",
      narration:
        "When the moment comes, press Give to players. Tick who receives it, and before anything is sent you see what else giving it would reveal.",
      async run({ page, tap, hold }) {
        await tap(page.getByRole("button", { name: "Give to players" }), 1200);
        const dialog = page.getByRole("dialog");
        await dialog.waitFor();
        await hold(1200);
        await tap(dialog.getByText("Chicory", { exact: true }), 1000);
        await dialog.getByText("It arrives in their journal straight away").waitFor();
        await hold(3000);
        await tap(dialog.getByRole("button", { name: "Give it" }), 800);
        await dialog.waitFor({ state: "detached" });
        await page.getByTestId("audience-line").waitFor();
        await hold(2500);
      },
    },

    // ── On the player's phone ───────────────────────────────────────────────────────────────────
    {
      id: "arrive",
      chapter: "On the player's phone",
      device: "phone",
      account: "player",
      caption: "It arrives at once",
      narration: "On the player's phone the letter arrives straight away, marked as new until it is read.",
      startAt: "/play/journal?tab=handouts",
      async run({ page, hold, settled, focus }) {
        const card = page.getByText(LETTER_TITLE).first();
        await card.waitFor({ timeout: 20_000 });
        await settled();
        await hold(1500);
        await focus(card, { padding: 60 });
        await hold(2500);
      },
    },
    {
      id: "read",
      device: "phone",
      account: "player",
      caption: "Read on its own paper",
      narration: "It opens as a page of its own paper, fitted to the phone, sketch and all.",
      async run({ page, tap, hold, settled, scrollTo }) {
        await tap(page.getByText(LETTER_TITLE).first(), 1000);
        await page.waitForURL(/\/play\/handouts\//);
        await settled();
        await hold(2200);
        await scrollTo(page.getByRole("img", { name: KEEPER_SKETCH }), 1800, 140);
        await hold(2500);
      },
    },

    // ── Reading and printing ────────────────────────────────────────────────────────────────────
    {
      id: "spreads",
      chapter: "Reading and printing",
      device: "desktop",
      account: "dm",
      caption: "Read as spreads",
      narration:
        "Read as spreads shows the whole book the way it will print, two pages at a time, lit like a desk by lamplight. Escape brings you back to the page you were on.",
      startAt: "/scriptorium",
      async run({ page, tap, hold, settled }) {
        await page.getByRole("heading", { name: "The Locked Workshop" }).waitFor();
        await settled();
        await hold(800);
        await tap(page.locator("div.group", { hasText: "The Locked Workshop" }).locator("a").first(), 600);
        await page.getByTestId("book-editor").waitFor({ timeout: 30_000 });
        await settled();
        await hold(600);
        await tap(page.getByRole("button", { name: "Read as spreads" }), 1000);
        await page.getByTestId("inspect-pages").waitFor();
        await hold(2200);
        for (let i = 0; i < 3; i++) {
          await tap(page.getByRole("button", { name: "Next spread" }), 1800);
        }
        await page.keyboard.press("Escape");
        await hold(1500);
      },
    },
    {
      id: "pdf",
      caption: "A real PDF",
      narration:
        "And when the book is ready, PDF makes a real print file, with text you can select, for your own printer or a print shop.",
      async run({ page, hold, focus }) {
        const button = page.getByRole("button", { name: "Export PDF" });
        await button.waitFor();
        await glideTo(page, page.getByRole("button", { name: "Read as spreads" }), 900);
        await hold(1200);
        await glideTo(page, button, 1400);
        await focus(button, { padding: 200 });
        await hold(6200);
      },
    },
  ],
};
