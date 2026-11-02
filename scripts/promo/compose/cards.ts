/** Static art for the video, drawn by headless Chrome and saved as PNG. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { BROWSER_BAR, DEVICES } from "../devices.ts";
import type { Device } from "../types.ts";

export const BACKGROUND = "#f2ece0"; // vellum --background
export const INK = "#2b2019"; // vellum --foreground
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
      // Text that wraps past its lines (data-lines, two by default) shrinks until it fits.
      await page.evaluate(`(() => {
        const el = document.getElementById("fit");
        if (!el) return;
        const lines = Number(el.dataset.lines || 2);
        let size = parseFloat(getComputedStyle(el).fontSize);
        const ratio = parseFloat(getComputedStyle(el).lineHeight) / size;
        while (size > 30 && el.getBoundingClientRect().height > size * ratio * lines + 2) {
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

const SHADOW = "0 28px 70px rgba(43,32,25,.38),0 6px 18px rgba(43,32,25,.22)";
const LOCK = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.6" fill="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`;

/**
 * The Reel's page behind a shot, with the frame the screen sits in: a device's
 * screen box, or a browser window whose title bar carries the three window dots
 * and the app's address. Both are rounded and cast the same shadow.
 */
export const baseCard = (file: string, device: Device): Card => {
  const { window: w, frame } = DEVICES[device];
  if (frame === "device") {
    return {
      file,
      width: 1080,
      height: 1920,
      transparent: false,
      body: `<div class="s"></div>`,
      css: `.s{position:absolute;left:${w.x}px;top:${w.y}px;width:${w.w}px;height:${w.h}px;border-radius:${w.radius}px;background:#000;box-shadow:${SHADOW}}`,
    };
  }
  return {
    file,
    width: 1080,
    height: 1920,
    transparent: false,
    body: `<div class="win"><div class="bar"><i></i><i></i><i></i><div class="url">${LOCK}<span>app.dungeongrimoire.com</span></div></div></div>`,
    css: `.win{position:absolute;left:${w.x}px;top:${w.y - BROWSER_BAR}px;width:${w.w}px;height:${w.h + BROWSER_BAR}px;border-radius:${w.radius}px;background:#fbf7ef;box-shadow:${SHADOW},0 0 0 1px rgba(43,32,25,.14);overflow:hidden}
      .bar{position:relative;height:${BROWSER_BAR}px;display:flex;align-items:center;gap:9px;padding:0 20px;background:#e8dfcd;border-bottom:1px solid rgba(43,32,25,.14)}
      .bar i{width:13px;height:13px;border-radius:50%;background:#c9bda6}
      .bar i:nth-child(1){background:#c96a52}.bar i:nth-child(2){background:#d6a94a}.bar i:nth-child(3){background:#7c9a5c}
      .url{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);height:32px;padding:0 22px;border-radius:9999px;background:#f8f4ea;display:flex;align-items:center;gap:8px;font:700 19px 'Alegreya Sans',sans-serif;color:#7a6b5a}`,
  };
};

/** The screen's rounded corners: all four on a device, the bottom two in a browser (the title bar covers the top). */
export const maskCard = (file: string, device: Device): Card => {
  const { window: w, frame } = DEVICES[device];
  const radius = frame === "device" ? `${w.radius}px` : `0 0 ${w.radius}px ${w.radius}px`;
  return {
    file,
    width: w.w,
    height: w.h,
    transparent: true,
    body: `<div class="m"></div>`,
    css: `.m{width:${w.w}px;height:${w.h}px;border-radius:${radius};background:#fff}`,
  };
};

/**
 * What the camera looks at, in device pixels: a device's screen on black, or a
 * desktop screen on plain paper, which reads as the page's own margin inside the
 * browser when a view takes in more than the screen (the whole of a page with no
 * sidebar, or an overview).
 */
export const backdropCard = (file: string, device: Device, canvas: { width: number; height: number }): Card => ({
  file,
  width: canvas.width,
  height: canvas.height,
  transparent: false,
  body: "",
  css: DEVICES[device].frame === "device" ? `html,body{background:#000!important}` : "",
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

/** A shot's narration written out under a desktop window (`DeviceSpec.subtitles`), up to four lines. */
export const subtitleCard = (file: string, text: string, height: number): Card => ({
  file,
  width: 1080,
  height,
  transparent: true,
  body: `<div class="w"><div id="fit" data-lines="4">${esc(text)}</div></div>`,
  css: `.w{width:1080px;height:${height}px;display:flex;align-items:flex-start;justify-content:center}
    #fit{max-width:940px;text-align:center;text-wrap:balance;font:700 46px/1.3 'Alegreya Sans',sans-serif;color:${INK}}`,
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
