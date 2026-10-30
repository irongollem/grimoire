/** Static art for the video, drawn by headless Chrome and saved as PNG. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

export const BACKGROUND = "#f2ece0"; // vellum --background
export const INK = "#2b2019"; // vellum --foreground
export const SCREEN = { x: 150, y: 430, w: 780, h: 1387, radius: 44 } as const;
export const CAPTION_BAND = { y: 230, h: 180 } as const;

const FONTS = resolve("node_modules/@fontsource");
const fontFace = (family: string, pkg: string, file: string) =>
  `@font-face{font-family:'${family}';src:url('${pathToFileURL(join(FONTS, pkg, "files", file)).href}') format('woff2');font-weight:${family === "Alegreya Sans" ? 700 : 400};}`;
const FACES = `${fontFace("Alegreya Sans", "alegreya-sans", "alegreya-sans-latin-700-normal.woff2")}
${fontFace("Fondamento", "fondamento", "fondamento-latin-400-normal.woff2")}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Card {
  file: string;
  width: number;
  height: number;
  transparent: boolean;
  body: string;
  css?: string;
}

/** Renders every card in one browser session. Page files live in `workDir`. */
export async function renderCards(workDir: string, cards: Card[]): Promise<void> {
  mkdirSync(workDir, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    for (const [i, card] of cards.entries()) {
      const html = `<!doctype html><meta charset="utf-8"><style>${FACES}
        html,body{margin:0;width:${card.width}px;height:${card.height}px;background:${card.transparent ? "transparent" : BACKGROUND};overflow:hidden}
        ${card.css ?? ""}</style>${card.body}`;
      const pagePath = join(workDir, `card-${i}.html`);
      writeFileSync(pagePath, html);
      const page = await browser.newPage({ viewport: { width: card.width, height: card.height } });
      await page.goto(pathToFileURL(pagePath).href);
      // Scripts run in the page, so they are strings (this file is typed without DOM lib).
      await page.evaluate("document.fonts.ready.then(() => undefined)");
      // A caption that wraps past two lines shrinks until it fits.
      await page.evaluate(`(() => {
        const el = document.getElementById("fit");
        if (!el) return;
        let size = parseFloat(getComputedStyle(el).fontSize);
        while (size > 34 && el.getBoundingClientRect().height > size * 1.15 * 2 + 2) {
          size -= 2;
          el.style.fontSize = size + "px";
        }
      })()`);
      mkdirSync(dirname(card.file), { recursive: true });
      await page.screenshot({ path: card.file, omitBackground: card.transparent });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

const sq = SCREEN;
const screenBox = `position:absolute;left:${sq.x}px;top:${sq.y}px;width:${sq.w}px;height:${sq.h}px;border-radius:${sq.radius}px;`;

export const baseCard = (file: string): Card => ({
  file,
  width: 1080,
  height: 1920,
  transparent: false,
  body: `<div class="s"></div>`,
  css: `.s{${screenBox}background:#000;box-shadow:0 28px 70px rgba(43,32,25,.38),0 6px 18px rgba(43,32,25,.22)}`,
});

export const maskCard = (file: string): Card => ({
  file,
  width: sq.w,
  height: sq.h,
  transparent: true,
  body: `<div class="m"></div>`,
  css: `.m{width:${sq.w}px;height:${sq.h}px;border-radius:${sq.radius}px;background:#fff}`,
});

export const captionCard = (file: string, text: string): Card => ({
  file,
  width: 1080,
  height: CAPTION_BAND.h,
  transparent: true,
  body: `<div class="w"><div id="fit">${esc(text)}</div></div>`,
  css: `.w{width:1080px;height:${CAPTION_BAND.h}px;display:flex;align-items:center;justify-content:center}
    #fit{max-width:900px;text-align:center;text-wrap:balance;font:700 56px/1.15 'Alegreya Sans',sans-serif;color:${INK}}`,
});

/** The wordmark with its bookmark banner, the same file the app's boot splash shows. */
const LOGO = pathToFileURL(resolve("public/brand/logo-light.webp")).href;
const logo = `<img class="n" src="${LOGO}" alt="Dungeon Grimoire">`;

const brandCss = `.w{width:1080px;height:1920px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:56px;color:${INK};text-align:center}
  .n{width:880px;height:auto;display:block}
  .t{font:700 60px/1.2 'Alegreya Sans',sans-serif;max-width:860px;text-wrap:balance}`;

export const introCard = (file: string, title: string): Card => ({
  file,
  width: 1080,
  height: 1920,
  transparent: false,
  body: `<div class="w">${logo}<div class="t">${esc(title)}</div></div>`,
  css: brandCss,
});

export const outroCard = (file: string): Card => ({
  file,
  width: 1080,
  height: 1920,
  transparent: false,
  body: `<div class="w">${logo}<div class="t">dungeongrimoire.com</div></div>`,
  css: brandCss,
});
