/**
 * Saves each "Steal this" post's Card Forge card, front and back, through the
 * card's own Save front / Save back buttons (`/forge`), so the slides and the
 * teaser Reel show exactly the PNG a DM gets: print size, 300 dpi, transparent
 * rounded corners.
 *   tsx --tsconfig tsconfig.node.json scripts/promo/steal/cards.ts [--base http://localhost:5173]
 * Writes promo-out/<post id>/pages/card-<style>-<size>-front.png and -back.png.
 */
import { join, resolve } from "node:path";
import { demoCampaignId } from "../setup/demo";
import { launchOffstage, openOffstage } from "../stage";
import { STEAL_POSTS } from "./posts";

const STYLES = [
  { id: "inked", label: "Inked" },
  { id: "modern", label: "Modern" },
] as const;
const SIZES = [
  { id: "mtg", label: "Trading card (63×88mm)" },
  { id: "tarot", label: "Tarot (70×120mm)" },
] as const;

async function main() {
  const args = process.argv.slice(2);
  const baseAt = args.indexOf("--base");
  const base = baseAt >= 0 ? args[baseAt + 1] : "http://localhost:5173";
  const browser = await launchOffstage();
  try {
    const { page, open } = await openOffstage(browser, { base, account: "dm", campaignId: demoCampaignId(), seed: 1 });
    await page.setViewportSize({ width: 1440, height: 1400 });
    await open("/forge");
    const visible = (l: ReturnType<typeof page.locator>) => l.filter({ visible: true }).first();
    await visible(page.getByRole("button", { name: "Collection", exact: true })).click();
    const panel = page.locator(".source-panel");
    await panel.locator(".src-tab", { hasText: "Monsters" }).click();
    await panel.locator(".sel-action", { hasText: "None" }).click();

    const posts = STEAL_POSTS.filter((p) => p.entity.type === "monster");
    const search = panel.locator(".search-input");
    for (const post of posts) {
      await search.fill(post.entity.name);
      await page.waitForTimeout(600);
      const box = panel.locator(".entity-list").getByRole("checkbox").first();
      if (!(await box.isChecked())) await box.check();
    }
    await search.fill("");

    for (const size of SIZES) {
      await visible(page.getByRole("radio", { name: size.label }).or(page.getByRole("button", { name: size.label }))).click();
      for (const style of STYLES) {
        await visible(page.getByRole("radio", { name: style.label, exact: true }).or(page.getByRole("button", { name: style.label, exact: true }))).click();
        await page.waitForTimeout(1200);
        const slots = page.locator(".preview-card-slot").filter({ visible: true });
        const n = await slots.count();
        for (let i = 0; i < n; i++) {
          const slot = slots.nth(i);
          const card = slot.locator(".preview-card-wrapper");
          const text = (await card.innerText()).toLowerCase();
          const post = posts.find((p) => text.includes(p.entity.name.toLowerCase()));
          if (!post) continue;
          const out = resolve("promo-out", post.id, "pages");
          await card.scrollIntoViewIfNeeded();
          for (const side of ["front", "back"] as const) {
            if (side === "back") {
              await card.click();
              await page.waitForTimeout(1000);
            }
            const [download] = await Promise.all([
              page.waitForEvent("download"),
              slot.getByRole("button", { name: side === "front" ? "Save front" : "Save back" }).click(),
            ]);
            await download.saveAs(join(out, `card-${style.id}-${size.id}-${side}.png`));
          }
          await card.click();
          await page.waitForTimeout(800);
        }
        console.log(`${style.id} ${size.id}: ${n} card(s)`);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
