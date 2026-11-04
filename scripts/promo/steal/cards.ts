/**
 * Captures each "Steal this" post's Card Forge card, front and back, from the
 * app's own preview (`/forge`), so the card can join the post's slides.
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
        const cards = page.locator(".preview-card-wrapper").filter({ visible: true });
        const n = await cards.count();
        for (let i = 0; i < n; i++) {
          const card = cards.nth(i);
          const text = (await card.innerText()).toLowerCase();
          const post = posts.find((p) => text.includes(p.entity.name.toLowerCase()));
          if (!post) continue;
          const out = resolve("promo-out", post.id, "pages");
          // The card tilts towards the pointer; park the pointer off the card before each shot.
          await page.mouse.move(5, 5);
          await card.scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
          await card.screenshot({ path: join(out, `card-${style.id}-${size.id}-front.png`) });
          await card.click();
          await page.mouse.move(5, 5);
          await page.waitForTimeout(1200);
          await card.screenshot({ path: join(out, `card-${style.id}-${size.id}-back.png`) });
          await card.click();
          await page.mouse.move(5, 5);
          await page.waitForTimeout(1000);
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
