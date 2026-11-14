import type { Locator, Page } from "playwright";
import { PAINTING, setupIlluminator, sotheryBookId, teardownIlluminator } from "../setup/illuminator.ts";
import type { Episode, ShotContext } from "../types.ts";

/** The painting on the page: the visible copy only, because the app keeps hidden ones. */
function painting(page: Page): Locator {
  return page.locator(`.ProseMirror img[src*="${PAINTING}"]`).filter({ visible: true }).first();
}

/**
 * The painting once it is selected. An edit replaces the picture's `src` with the baked file, so the file name that
 * finds it before the edit finds nothing after; the selection is what stays.
 */
function selectedPainting(page: Page): Locator {
  return page.locator(".ProseMirror img.ProseMirror-selectednode").filter({ visible: true }).first();
}

/** Drags a range input's thumb from where it stands to `to`, so the slider is seen to move. */
async function dragRange(page: Page, slider: Locator, to: number): Promise<void> {
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
 * Points the camera at a rectangle no single element covers: an invisible fixed box is laid over it, the camera frames
 * it, and the box is removed once the glide has started (the camera keeps its target).
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

/** Points the camera at the painting with a little room around it. */
async function focusPainting(page: Page, focus: ShotContext["focus"]): Promise<void> {
  const box = await selectedPainting(page).boundingBox();
  if (!box) throw new Error("The painting is not on the page.");
  const pad = 30;
  await focusArea(page, focus, { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 });
}

/**
 * The DM editing one painting of the setting book where it sits (#1176 frame 11): torn edges, a little colour and a
 * vignette, the picture printed into the paper, then the Illuminator's paper wash with Compare. The book is
 * "Sothery: A Campaign Setting" in "Late in the Kind Country".
 */
export const illuminator: Episode = {
  id: "illuminator",
  title: "Edit a picture where it sits",
  account: "dm",
  device: "desktop",
  campaign: "kind-country",
  setup: setupIlluminator,
  teardown: teardownIlluminator,
  seed: 7,
  shots: [
    {
      id: "pick",
      caption: "Every picture can be edited in place",
      narration: "This is our setting book, Sothery. Click a painting on the page and open Edit picture.",
      // Read when the shot opens, not at import: the registry loads every episode, and the book id is looked up in the database.
      get startAt() {
        return `/scriptorium/${sotheryBookId()}`;
      },
      // Not filmed: the first open of a 15-chapter book lays every chapter out ("Numbering the rest of the book",
      // 11 to 20 s), and a click before that ends moves with the pages.
      async ready(page) {
        await page.getByTestId("book-editor").waitFor({ timeout: 30_000 });
        await page.getByRole("navigation", { name: "Chapters" }).getByRole("button", { name: /^Welcome to Sothery/ }).click();
        await page.locator(`.ProseMirror img[src*="${PAINTING}"]`).first().waitFor({ state: "attached", timeout: 60_000 });
        await page.getByTestId("rail-numbering").waitFor({ state: "detached", timeout: 120_000 });
        await page.waitForTimeout(800);
      },
      async run({ page, hold, settled, tap, scrollTo }) {
        await settled();
        await hold(1600);
        await scrollTo(painting(page), 1000, 150);
        await hold(1800);
        await tap(painting(page), 700);
        await page.getByTestId("panel-picture-edit").filter({ visible: true }).first().waitFor({ timeout: 20_000 });
        await hold(2600);
      },
    },
    {
      id: "edges",
      caption: "Torn paper edges",
      narration: "Under Edges, pick Torn paper, and the painting gets a torn edge, like a sheet pasted into the book.",
      async run({ page, tap, hold, focus }) {
        const torn = page.getByRole("button", { name: "Torn paper", exact: true }).filter({ visible: true }).first();
        await torn.scrollIntoViewIfNeeded();
        await focus(torn, { padding: 140 });
        await hold(1400);
        await tap(torn, 800);
        await focusPainting(page, focus);
        await hold(3200);
      },
    },
    {
      id: "colour",
      caption: "Colour and a vignette",
      narration: "Warm the Colour a little and add a Vignette, so it settles into the page.",
      async run({ page, hold, focus }) {
        const warmth = page.getByRole("slider", { name: "Warmth" }).filter({ visible: true }).first();
        await warmth.scrollIntoViewIfNeeded();
        await focus(warmth, { padding: 140 });
        await hold(900);
        await dragRange(page, warmth, 68);
        await hold(900);
        const vignette = page.getByRole("slider", { name: "Vignette" }).filter({ visible: true }).first();
        await vignette.scrollIntoViewIfNeeded();
        await focus(vignette, { padding: 140 });
        await hold(500);
        await dragRange(page, vignette, 55);
        await hold(400);
        await focusPainting(page, focus);
        await hold(2000);
      },
    },
    {
      id: "paper",
      caption: "Printed into the paper",
      narration: "Choose Printed into the paper, and the painting takes on the page's own tone.",
      async run({ page, tap, hold, focus }) {
        const blend = page.getByRole("button", { name: "Printed into the paper" }).filter({ visible: true }).first();
        await blend.scrollIntoViewIfNeeded();
        await focus(blend, { padding: 140 });
        await hold(800);
        await tap(blend, 600);
        await focusPainting(page, focus);
        await hold(1400);
        // The change is gentle (the edge and the sky take the page's tone), so it is shown going back and forth once.
        await tap(page.getByRole("button", { name: "On top" }).filter({ visible: true }).first(), 1200);
        await tap(blend, 1600);
      },
    },
    {
      id: "wash",
      caption: "More tools: the Illuminator",
      narration: "More tools opens the Illuminator. Paint a paper wash in from one side, and Compare shows what you started with.",
      async run({ page, tap, hold, focus }) {
        const open = page.getByTestId("panel-open-workbench").filter({ visible: true }).first();
        await open.scrollIntoViewIfNeeded();
        await focus(open, { padding: 140 });
        await hold(900);
        await tap(open, 1000);
        const bench = page.getByTestId("illuminator-workbench");
        await bench.waitFor({ timeout: 30_000 });
        await focus(null);
        await hold(700);
        await tap(bench.getByTestId("tool-wash"), 600);
        await tap(bench.getByTestId("wash-on"), 1600);
        await tap(bench.getByTestId("compare-toggle"), 1000);
        const stage = bench.getByTestId("workbench-pointer-layer");
        const box = await stage.boundingBox();
        if (!box) throw new Error("The workbench stage is not on screen.");
        const y = box.y + box.height * 0.5;
        await page.mouse.move(box.x + box.width * 0.5, y, { steps: 20 });
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.2, y, { steps: 40 });
        await page.mouse.move(box.x + box.width * 0.75, y, { steps: 50 });
        await page.mouse.up();
        await hold(1400);
        await tap(bench.getByTestId("workbench-done"), 600);
        await bench.waitFor({ state: "detached" });
        await hold(1600);
      },
    },
  ],
};
