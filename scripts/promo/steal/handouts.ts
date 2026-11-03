/**
 * Writes each "Steal this" post's page (a one-chapter book) into the DM fixture's demo copy
 * (fixed ids, so a re-run replaces it) and captures its pages from the
 * Scriptorium's own preview, the same layout engine that prints.
 *   tsx --tsconfig tsconfig.node.json scripts/promo/steal/handouts.ts [post id] [--base http://localhost:5173]
 * Writes promo-out/<post id>/pages/: page-1.png and lore.json (the lore page at A5 and how far
 * down its writing reaches), card.png (the stat block alone, at A4) and editor.png.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { quote, sql } from "../../lib/dev-db.ts";
import { demoCampaignId, localDb } from "../setup/demo";
import { launchOffstage, openOffstage } from "../stage";
import { STEAL_POSTS, type StealPost } from "./posts";

const TABLE = { monster: "monsters", item: "items", npc: "npcs" } as const;

/** The slice of a DOM element measured in the page; the scripts' tsconfig has no DOM types. */
interface Box {
  getBoundingClientRect(): { top: number; bottom: number; height: number };
  querySelectorAll(selector: string): ArrayLike<Box>;
}

function writeHandout(post: StealPost, campaignId: string, pageSize: "A4" | "A5"): void {
  const db = localDb();
  const entityId = sql(db, `select id from public.${TABLE[post.entity.type]} where campaign_id = ${quote(campaignId)} and name = ${quote(post.entity.name)} limit 1`);
  if (!entityId) throw new Error(`${post.id}: no ${post.entity.type} named ${post.entity.name} in the demo copy`);
  const owner = sql(db, `select user_id from public.campaigns where id = ${quote(campaignId)}`);
  // The preview shows the page as players see it, and a monster's stat block is only theirs once revealed;
  // giving the stats away is the point of the post.
  const content = { type: "doc", content: [...post.blocks, { type: "entityEmbed", attrs: { entityType: post.entity.type, entityId, ...(post.entity.type === "monster" ? { reveal: { stats: true } } : {}) } }] };
  const title = `Steal this: ${post.entity.name}`;
  sql(
    db,
    `insert into public.scriptorium_documents (id, user_id, campaign_id, title, doc_type, kind, theme, page_size)
       values (${quote(post.documentId)}, ${quote(owner)}, ${quote(campaignId)}, ${quote(title)}, ${quote(post.entity.type)}, 'book', ${quote(post.look)}, ${quote(pageSize)})
     on conflict (id) do update set title = excluded.title, theme = excluded.theme, doc_type = excluded.doc_type, kind = excluded.kind, page_size = excluded.page_size;
     -- A handout keeps its one chapter (private.keep_one_chapter refuses deleting the last), so a re-run rewrites it.
     with rewritten as (
       update public.scriptorium_chapters set title = ${quote(post.entity.name)}, content = ${quote(JSON.stringify(content))}::jsonb
        where document_id = ${quote(post.documentId)} and position = 0 returning id
     )
     insert into public.scriptorium_chapters (document_id, position, title, content)
       select ${quote(post.documentId)}, 0, ${quote(post.entity.name)}, ${quote(JSON.stringify(content))}::jsonb
        where not exists (select 1 from rewritten);`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const baseAt = args.indexOf("--base");
  const base = baseAt >= 0 ? args[baseAt + 1] : "http://localhost:5173";
  const only = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--base");
  const posts = STEAL_POSTS.filter((p) => !only || p.id === only);
  if (posts.length === 0) throw new Error(`No post ${only}`);

  const campaignId = demoCampaignId();
  const browser = await launchOffstage();
  try {
    const { page, open } = await openOffstage(browser, { base, account: "dm", campaignId, seed: 1 });
    /** Opens the page in the editor and waits for the layout, which settles after the embed's stat block has loaded. */
    async function openBook(post: StealPost): Promise<void> {
      await page.setViewportSize({ width: 1440, height: 900 });
      await open(`/scriptorium/${post.documentId}`);
      await page.waitForSelector(".pagedjs_page", { timeout: 30_000 });
      await page.waitForTimeout(3000);
    }
    /** Tall enough that a whole page sits below the editor's sticky bars, which would otherwise be in the shot. */
    async function tall(): Promise<void> {
      await page.setViewportSize({ width: 1440, height: 2400 });
      await page.waitForTimeout(1500);
    }

    for (const post of posts) {
      const out = resolve("promo-out", post.id, "pages");
      rmSync(out, { recursive: true, force: true });
      mkdirSync(out, { recursive: true });

      // A5 for the lore page: a narrow page keeps its text large on a phone-sized slide.
      writeHandout(post, campaignId, "A5");
      await openBook(post);
      // The editor as the DM sees it, for the closing slide: this is where the page was written.
      await page.screenshot({ path: join(out, "editor.png") });
      await tall();
      const lorePage = page.locator(".pagedjs_page").filter({ visible: true }).first();
      await lorePage.scrollIntoViewIfNeeded();
      await lorePage.screenshot({ path: join(out, "page-1.png") });
      // How far down the page its writing reaches, so the lore slide can crop off the empty parchment.
      const writtenTo = await lorePage.evaluate((node) => {
        const el = node as unknown as Box;
        const r = el.getBoundingClientRect();
        let bottom = r.top;
        // Every written block carries a block id; Paged.js's own boxes (margins, footnote area) do not.
        for (const e of Array.from(el.querySelectorAll(".pagedjs_page_content [data-block-id]"))) {
          const b = e.getBoundingClientRect();
          if (b.height > 0 && b.bottom <= r.bottom) bottom = Math.max(bottom, b.bottom);
        }
        return (bottom - r.top) / r.height;
      });
      writeFileSync(join(out, "lore.json"), JSON.stringify({ writtenTo }) + "\n");

      // A4 for the stat block: the 2024 ability table needs a wide card (#1140).
      writeHandout(post, campaignId, "A4");
      await openBook(post);
      await tall();
      // The embed's own box has no height; the card is the stat block inside its entry.
      const card = page.locator(".pagedjs_page .sc-statblock").filter({ visible: true }).first();
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: join(out, "card.png") });
      console.log(`${post.id}: lore page, card and editor in ${out}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
