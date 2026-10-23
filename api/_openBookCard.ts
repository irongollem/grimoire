// The 1200x630 share card of an Open Book or one of its sessions (#1085), as a satori element tree.
//
// Plain objects rather than JSX: api/ has no JSX transform, and satori reads `{ type, props }` all the same.
// Pure, so the render can be exercised in node against a fixture (see the verification in the story).
//
// Design: "When someone shares the link" in Release.dc. Book card: cover art (or leather) full-bleed under a
// dark left-to-right gradient, "AN OPEN BOOK" in gilt, the title in gilt Cinzel, the italic subtitle, the
// counts, the logo bottom-right. Session card: picture full-bleed, a bottom gradient, "SESSION XIV · THE
// SALTREACH" and the session title.

import type { PublicOpenBookMeta } from "../src/types/openBook.types.js";
import { roman, statsLine } from "./_openBookMeta.js";

export const CARD_W = 1200;
export const CARD_H = 630;

const GILT = "#e2b75a";
const GILT_DIM = "#c9962e";

export interface CardAssets {
  /** data: URI of the leather texture for the book's leather. */
  leather: string;
  /** data: URI of the cover image, when the book has one and it could be fetched. */
  cover: string | null;
  /** data: URI of the dark-theme logo. */
  logo: string | null;
}

type El = { type: string; props: Record<string, unknown> };

function el(type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}): El {
  return { type, props: { style, ...extra, ...(children === undefined ? {} : { children }) } };
}

/** Leather tint laid over the (oxblood-ish) texture, so each leather reads as its own colour. */
const LEATHER_TINT: Record<string, string | null> = {
  oxblood: null,
  sea: "rgb(20 70 90 / .62)",
  night: "rgb(14 20 46 / .7)",
  walnut: "rgb(70 44 20 / .55)",
  ash: "rgb(110 110 106 / .5)",
};

/** Largest title size that keeps a long name inside the left column without clipping. */
export function titleSize(title: string): number {
  const n = title.length;
  if (n <= 14) return 84;
  if (n <= 24) return 68;
  if (n <= 40) return 54;
  return 42;
}

function backdrop(assets: CardAssets, leather: string): El[] {
  const layers: El[] = [];
  if (assets.cover) {
    layers.push(el("img", { position: "absolute", left: 0, top: 0, width: CARD_W, height: CARD_H, objectFit: "cover" }, undefined, { src: assets.cover, width: CARD_W, height: CARD_H }));
  } else {
    layers.push(el("img", { position: "absolute", left: 0, top: 0, width: CARD_W, height: CARD_H, objectFit: "cover" }, undefined, { src: assets.leather, width: CARD_W, height: CARD_H }));
    const tint = LEATHER_TINT[leather];
    if (tint) layers.push(el("div", { position: "absolute", left: 0, top: 0, width: CARD_W, height: CARD_H, background: tint }));
  }
  return layers;
}

function logo(assets: CardAssets): El[] {
  return assets.logo ? [el("img", { position: "absolute", right: 36, bottom: 30, height: 44, opacity: 0.9 }, undefined, { src: assets.logo, height: 44 })] : [];
}

export function bookCard(meta: PublicOpenBookMeta, assets: CardAssets): El {
  const book = meta.snapshot.book;
  const stats = statsLine(meta.release.stats);
  const column: El[] = [
    el("div", { color: GILT_DIM, fontFamily: "Alegreya", fontWeight: 700, fontSize: 24, letterSpacing: 6 }, "AN OPEN BOOK"),
    el("div", { marginTop: 18, color: GILT, fontFamily: "Cinzel", fontWeight: 700, fontSize: titleSize(book.title), lineHeight: 1.05, letterSpacing: 3 }, book.title.toUpperCase()),
  ];
  if (book.subtitle) {
    column.push(el("div", { marginTop: 22, color: "#e6d6b0", fontFamily: "Alegreya", fontStyle: "italic", fontWeight: 400, fontSize: 36, lineHeight: 1.25 }, book.subtitle.slice(0, 120)));
  }
  if (stats) {
    column.push(el("div", { marginTop: 30, color: "#b3a48c", fontFamily: "Alegreya", fontWeight: 700, fontSize: 26, letterSpacing: 1 }, stats));
  }
  return el("div", { display: "flex", position: "relative", width: CARD_W, height: CARD_H, background: "#1a0e0a" }, [
    ...backdrop(assets, book.leather),
    el("div", { position: "absolute", left: 0, top: 0, width: CARD_W, height: CARD_H, backgroundImage: "linear-gradient(to right, rgba(12,10,8,.93) 0%, rgba(12,10,8,.8) 48%, rgba(12,10,8,0) 76%)" }),
    el("div", { position: "absolute", left: 64, top: 0, width: 600, height: CARD_H, display: "flex", flexDirection: "column", justifyContent: "center" }, column),
    ...logo(assets),
  ]);
}

export function sessionCard(meta: PublicOpenBookMeta, session: PublicOpenBookMeta["sessions"][number], assets: CardAssets): El {
  const book = meta.snapshot.book;
  const label = session.number != null ? `SESSION ${roman(session.number)}` : "SESSION";
  return el("div", { display: "flex", position: "relative", width: CARD_W, height: CARD_H, background: "#1a0e0a" }, [
    ...backdrop(assets, book.leather),
    el("div", { position: "absolute", left: 0, top: 0, width: CARD_W, height: CARD_H, backgroundImage: "linear-gradient(to top, rgba(12,10,8,.94) 0%, rgba(12,10,8,.62) 38%, rgba(12,10,8,0) 66%)" }),
    el("div", { position: "absolute", left: 64, right: 64, bottom: 56, display: "flex", flexDirection: "column" }, [
      el("div", { color: GILT_DIM, fontFamily: "Alegreya", fontWeight: 700, fontSize: 24, letterSpacing: 6 }, `${label} · ${book.title.toUpperCase()}`.slice(0, 80)),
      el("div", { marginTop: 14, color: "#f2e6c8", fontFamily: "Cinzel", fontWeight: 700, fontSize: titleSize(session.title) * 0.8, lineHeight: 1.1, letterSpacing: 2, maxWidth: 940 }, session.title.slice(0, 120)),
    ]),
    ...logo(assets),
  ]);
}
