/**
 * Links in the printed book (#1085). The articles are the reader's own components, so their links are the web
 * book's addresses (`/w/<slug>/<chapter>/<id>`). In a PDF a link to a page the file holds should jump inside the
 * file, and one it cannot hold should still work, so each address is rewritten here: to an anchor when the book
 * has that page, to the public address on this origin otherwise.
 */

export const CONTENTS_ID = "contents";
export const ALMANAC_ID = "almanac";
export const INDEX_ID = "index";

export function entryAnchor(id: string): string {
  return `e-${id}`;
}

export function chapterAnchor(chapter: string): string {
  return `chapter-${chapter}`;
}

export interface LinkContext {
  slug: string;
  /** `window.location.origin`: where the public book is read. */
  origin: string;
  /** Ids of the entries the printed book holds. */
  entryIds: ReadonlySet<string>;
}

/** Where a link of the web book points in the printed one. Anything that is not the book's own is left alone. */
export function rewriteBookHref(href: string, ctx: LinkContext): string {
  let url: URL;
  try {
    url = new URL(href, ctx.origin);
  } catch {
    return href;
  }
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== "w" || parts[1] !== ctx.slug) return href;
  const rest = parts.slice(2);
  const web = `${ctx.origin}${url.pathname}`;

  if (rest.length === 0) return web;
  if (rest.length === 1) {
    if (rest[0] === "contents") return `#${CONTENTS_ID}`;
    if (rest[0] === "index") return `#${INDEX_ID}`;
    if (rest[0] === "chronicle") return `#${ALMANAC_ID}`;
    return `#${chapterAnchor(rest[0])}`;
  }
  return ctx.entryIds.has(rest[1]) ? `#${entryAnchor(rest[1])}` : web;
}

/**
 * Makes one rendered section fit the page: links rewritten, pictures loaded at once (a lazy picture in a host
 * nobody is looking at would never load), and the almanac's month buttons, which do nothing on paper, taken out.
 */
export function prepareSectionHtml(html: string, ctx: LinkContext, opts: { pageRefs?: boolean } = {}): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (href !== null) a.setAttribute("href", rewriteBookHref(href, ctx));
  });
  doc.querySelectorAll("img").forEach((img) => {
    img.removeAttribute("loading");
    img.setAttribute("decoding", "sync");
  });
  doc.querySelectorAll("button.book-step").forEach((b) => {
    // Keep the grid of the nav: the month heading sits in the middle of three.
    const spacer = doc.createElement("span");
    b.replaceWith(spacer);
  });
  if (opts.pageRefs) {
    // The index gives a page number per name: an empty link whose ::after the layout fills with the page.
    doc.querySelectorAll(".book-ref").forEach((row) => {
      const href = row.querySelector("a")?.getAttribute("href");
      if (!href?.startsWith("#")) return;
      const ref = doc.createElement("a");
      ref.className = "pb-pg";
      ref.setAttribute("href", href);
      row.appendChild(ref);
    });
  }
  // A connection line ends in the far page's number, filled in once the pages are cut (`applyFolios`).
  doc.querySelectorAll(".book-conn").forEach((row) => {
    const href = row.querySelector("a")?.getAttribute("href");
    if (!href?.startsWith("#")) return;
    const ref = doc.createElement("a");
    ref.className = "pb-pg";
    ref.setAttribute("href", href);
    row.appendChild(ref);
  });
  return doc.body.innerHTML;
}
