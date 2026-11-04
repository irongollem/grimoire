/**
 * Composes a "Steal this" post's slides (1080x1350, Instagram's 4:5) from what
 * handouts.ts captured and the entry's own art:
 *   1 cover   the art, full bleed, with the kicker and the hook
 *   2 lore    the book page (read-aloud, description, "Run it") laid over the art
 *   3 stats   the stat block card over the art
 *   4 card    its Card Forge trading card, front and back (cards.ts captures them)
 *   5 close   where it was made: the Scriptorium page in the editor
 *   tsx --tsconfig tsconfig.node.json scripts/promo/steal/slides.ts [post id]
 * Writes promo-out/<post id>/slides/slide-N.png and post.html (the slides side by side, for review).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { quote, sql } from "../../lib/dev-db.ts";
import { demoCampaignId, localDb } from "../setup/demo";
import { STEAL_POSTS, type StealPost } from "./posts";

const W = 1080;
const H = 1350;
const ROOT = resolve(".");
const url = (path: string) => pathToFileURL(path).href;
const FONTS = `
@font-face { font-family: Fondamento; src: url("${url(join(ROOT, "node_modules/@fontsource/fondamento/files/fondamento-latin-400-normal.woff2"))}"); }
@font-face { font-family: "Alegreya Sans"; font-weight: 400; src: url("${url(join(ROOT, "node_modules/@fontsource/alegreya-sans/files/alegreya-sans-latin-400-normal.woff2"))}"); }
@font-face { font-family: "Alegreya Sans"; font-weight: 700; src: url("${url(join(ROOT, "node_modules/@fontsource/alegreya-sans/files/alegreya-sans-latin-700-normal.woff2"))}"); }`;
const WORDMARK = url(join(ROOT, "art-src/brand/dg-wordmark-dark.svg"));

const BASE = `${FONTS}
html, body { margin: 0; }
.slide { width: ${W}px; height: ${H}px; position: relative; overflow: hidden; background: #15110d; font-family: "Alegreya Sans", sans-serif; color: #f1e4c8; }
.art { position: absolute; inset: 0; background-size: cover; background-position: center; }
.shade { position: absolute; inset: 0; }
.brand { position: absolute; left: 64px; bottom: 52px; width: 230px; opacity: .92; }
.count { position: absolute; right: 64px; bottom: 62px; font-size: 26px; letter-spacing: .16em; text-transform: uppercase; color: #e2bd62; font-weight: 700; }`;

function page(body: string, css: string): string {
  return `<!doctype html><meta charset="utf-8"><style>${BASE}${css}</style><div class="slide">${body}</div>`;
}

/** A PNG's pixel size, from its IHDR (bytes 16 to 23). */
function pngSize(file: string): { width: number; height: number } {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function slides(post: StealPost, dir: string, art: string): string[] {
  const pages = join(dir, "pages");
  const lore = { ...pngSize(join(pages, "page-1.png")), ...(JSON.parse(readFileSync(join(pages, "lore.json"), "utf8")) as { writtenTo: number }) };
  return [
    page(
      `<div class="art" style="background-image:url('${url(art)}')"></div>
       <div class="shade" style="background:linear-gradient(180deg, rgba(21,17,13,0) 38%, rgba(21,17,13,.82) 70%, rgba(21,17,13,.96) 100%)"></div>
       <div class="title"><div class="kicker">${post.kicker}</div><div class="hook">${post.hook}</div></div>
       <img class="brand" src="${WORDMARK}">
       <div class="count">Swipe</div>`,
      `.title { position: absolute; left: 64px; right: 64px; bottom: 150px; display: flex; flex-direction: column; gap: 22px; }
       .kicker { font-size: 34px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #e2bd62; }
       .hook { font-family: Fondamento, serif; font-size: 92px; line-height: 1.02; text-wrap: balance; text-shadow: 0 4px 30px rgba(0,0,0,.6); }`,
    ),
    page(
      `<div class="art" style="background-image:url('${url(art)}'); filter: blur(10px) brightness(.5); transform: scale(1.08)"></div>
       <div class="sheet" style="aspect-ratio: ${lore.width} / ${Math.round(lore.height * Math.min(1, lore.writtenTo + 0.05))}; background-image:url('${url(join(pages, "page-1.png"))}')"></div>
       <img class="brand" src="${WORDMARK}">`,
      `.sheet { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%) rotate(-1.2deg); width: 1000px; max-height: 1120px; background-size: 100% auto; background-position: top center; background-repeat: no-repeat; box-shadow: 0 30px 80px rgba(0,0,0,.6); border-radius: 4px; }`,
    ),
    page(
      `<div class="art" style="background-image:url('${url(art)}'); filter: brightness(.62)"></div>
       <img class="card" src="${url(join(pages, "card.png"))}">
       <img class="brand" src="${WORDMARK}">`,
      `.card { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); max-width: 1030px; max-height: 1150px; border-radius: 10px; box-shadow: 0 30px 80px rgba(0,0,0,.65); }`,
    ),
    page(
      `<div class="art" style="background-image:url('${url(art)}'); filter: blur(12px) brightness(.42); transform: scale(1.1)"></div>
       <div class="title"><div class="kicker">Print it as a card</div><div class="name">Card Forge</div></div>
       <img class="cf back" src="${url(join(pages, "card-inked-mtg-back.png"))}">
       <img class="cf front" src="${url(join(pages, "card-inked-mtg-front.png"))}">
       <img class="brand" src="${WORDMARK}">`,
      `.title { position: absolute; left: 0; right: 0; top: 70px; text-align: center; display: grid; gap: 6px; }
       .kicker { font-size: 32px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #e2bd62; }
       .name { font-family: Fondamento, serif; font-size: 76px; }
       .cf { position: absolute; width: 470px; border-radius: 22px; box-shadow: 0 30px 70px rgba(0,0,0,.7); }
       .front { left: 46px; top: 310px; transform: rotate(-4deg); }
       .back { right: 46px; top: 350px; transform: rotate(4deg); }`,
    ),
    page(
      `<div class="shade" style="background: radial-gradient(ellipse 80% 70% at 50% 45%, #3a2a1c 0%, #1f1813 60%, #15110d 100%)"></div>
       <img class="mark" src="${WORDMARK}">
       <div class="line">Made in Dungeon Grimoire</div>
       <div class="sub">The page from the Scriptorium, the card from Card Forge, and the stat block kept up to date in both.</div>
       <div class="window"><div class="bar"><i></i><i></i><i></i></div><div class="shot" style="background-image:url('${url(join(pages, "editor.png"))}')"></div></div>
       <div class="cta">Link in bio</div>`,
      `.mark { position: absolute; left: 50%; top: 92px; transform: translateX(-50%); width: 420px; }
       .line { position: absolute; left: 64px; right: 64px; top: 300px; text-align: center; font-family: Fondamento, serif; font-size: 70px; }
       .sub { position: absolute; left: 110px; right: 110px; top: 400px; text-align: center; font-size: 34px; line-height: 1.3; color: #c9b48f; }
       .window { position: absolute; left: 70px; top: 560px; width: 940px; border-radius: 14px; overflow: hidden; box-shadow: 0 30px 70px rgba(0,0,0,.6); background: #efe6d4; }
       .bar { height: 30px; background: #e2d6bf; display: flex; gap: 8px; align-items: center; padding: 0 14px; }
       .bar i { width: 11px; height: 11px; border-radius: 50%; background: #c8b796; }
       .shot { height: 588px; background-size: 100% auto; background-position: top left; }
       .cta { position: absolute; left: 0; right: 0; bottom: 70px; text-align: center; font-size: 30px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: #e2bd62; }`,
    ),
  ];
}

const TABLE = { monster: "monsters", item: "items", npc: "npcs" } as const;
const ART_COLUMN = { monster: "image_url", item: "image_url", npc: "portrait_url" } as const;

async function artFor(post: StealPost, dir: string): Promise<string> {
  const src = sql(
    localDb(),
    `select ${ART_COLUMN[post.entity.type]} from public.${TABLE[post.entity.type]} where campaign_id = ${quote(demoCampaignId())} and name = ${quote(post.entity.name)} limit 1`,
  );
  if (!src) throw new Error(`${post.id}: ${post.entity.name} has no art in the demo`);
  const file = join(dir, `art.${src.split(".").pop()}`);
  if (!existsSync(file)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`${post.id}: art download failed, HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file;
}

async function main() {
  const only = process.argv[2];
  const posts = STEAL_POSTS.filter((p) => !only || p.id === only);
  const browser = await chromium.launch();
  try {
    for (const post of posts) {
      const dir = resolve("promo-out", post.id);
      if (!existsSync(join(dir, "pages", "card.png"))) throw new Error(`${post.id}: run handouts.ts first`);
      const art = await artFor(post, dir);
      const out = join(dir, "slides");
      rmSync(out, { recursive: true, force: true });
      mkdirSync(out, { recursive: true });
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
      const html = slides(post, dir, art);
      for (let i = 0; i < html.length; i++) {
        const file = join(out, `slide-${i + 1}.html`);
        writeFileSync(file, html[i]);
        await page.goto(url(file));
        await page.waitForTimeout(500);
        await page.screenshot({ path: join(out, `slide-${i + 1}.png`) });
        rmSync(file);
      }
      await page.close();
      console.log(`${post.id}: ${html.length} slides in ${out}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
