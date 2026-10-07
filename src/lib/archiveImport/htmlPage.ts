/**
 * One HTML file (LegendKeeper's document export, World Anvil's readable HTML,
 * or any saved page) as a page. Generic semantics only: the content is
 * `<main>` / `<article>` / `<body>` minus navigation chrome, converted by the
 * same ProseMirror parser the paste importer uses (`sourceHtmlToTiptapContent`).
 *
 * That parser's paste schema has no link mark and unwraps `<a>`, so internal
 * links are swapped for sentinel text before conversion and rebuilt as
 * `archiveLink` nodes afterwards. External links keep their label only (the
 * schema cannot hold an href); images are dropped and counted.
 */
import { sourceHtmlToTiptapContent } from "@/lib/tiptap/sourceHtml";
import { guessKind } from "./kindHints";
import { archiveLinkNode, collectLinkTargets, internalTarget } from "./links";
import { baseName, docOf, folderOf, isEmptyBody, trimBody } from "./pageBuild";
import type { ParsedPage } from "./markdownPage";
import type { TiptapNode } from "./types";

/** Elements that are chrome, not content, wherever they sit. */
const CHROME_SELECTOR = "nav, header, footer, script, style, noscript, template, form, iframe, svg, button, [hidden], [aria-hidden='true']";
/** Files whose job is to list other pages. */
const INDEX_NAMES = new Set(["index", "toc", "contents", "sitemap"]);

const LINK_OPEN = "";
const LINK_SPLIT = "";
const LINK_CLOSE = "";
const SENTINEL = new RegExp(`${LINK_OPEN}(\\d+)${LINK_SPLIT}([\\s\\S]*?)${LINK_CLOSE}`, "g");

function humanizeSlug(name: string): string {
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    // keep as written
  }
  return /\s/.test(decoded) ? decoded : decoded.replace(/[-_]+/g, " ").trim();
}

/** Rebuilds `archiveLink` nodes from the sentinel text left in the converted body. */
function restoreLinks(nodes: TiptapNode[], targets: string[]): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const node of nodes) {
    if (node.type !== "text" || typeof node.text !== "string" || !node.text.includes(LINK_OPEN)) {
      out.push(Array.isArray(node.content) ? { ...node, content: restoreLinks(node.content as TiptapNode[], targets) } : node);
      continue;
    }
    const marks = Array.isArray(node.marks) ? { marks: node.marks } : {};
    let last = 0;
    for (const m of node.text.matchAll(SENTINEL)) {
      const index = m.index ?? 0;
      if (index > last) out.push({ type: "text", text: node.text.slice(last, index), ...marks });
      const target = targets[Number(m[1])];
      const label = m[2].trim();
      if (target && label) out.push({ ...archiveLinkNode(target, label), ...marks });
      else if (label) out.push({ type: "text", text: label, ...marks });
      last = index + m[0].length;
    }
    if (last < node.text.length) out.push({ type: "text", text: node.text.slice(last), ...marks });
  }
  return out;
}

export function readHtmlPage(path: string, html: string, templateHint: (candidates: string[]) => string | null): ParsedPage {
  if (typeof DOMParser === "undefined") return { skip: "HTML pages can only be read in a browser" };
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll(CHROME_SELECTOR).forEach((el) => el.remove());
  const container = doc.querySelector("main") ?? doc.querySelector("article") ?? doc.querySelector("[role='main']") ?? doc.body;

  const name = baseName(path).toLowerCase();
  if (INDEX_NAMES.has(name)) {
    const linkText = Array.from(container.querySelectorAll("a")).reduce((n, a) => n + (a.textContent?.length ?? 0), 0);
    const total = container.textContent?.trim().length ?? 0;
    if (container.querySelectorAll("a").length >= 3 && total - linkText < 80) return { skip: "index page (navigation only)" };
  }

  const h1 = container.querySelector("h1");
  const docTitle = doc.title.trim();
  let title: string;
  if (h1?.textContent?.trim()) {
    title = h1.textContent.trim().replace(/\s+/g, " ");
    h1.remove(); // the record has its own name field
  } else title = docTitle || humanizeSlug(baseName(path));

  const imageCount = container.querySelectorAll("img").length;

  const targets: string[] = [];
  container.querySelectorAll("a[href]").forEach((a) => {
    const label = a.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const target = internalTarget(a.getAttribute("href") ?? "", path);
    if (target) {
      targets.push(target);
      a.replaceWith(doc.createTextNode(`${LINK_OPEN}${targets.length - 1}${LINK_SPLIT}${label}${LINK_CLOSE}`));
    } else a.replaceWith(doc.createTextNode(label));
  });

  const converted = restoreLinks(sourceHtmlToTiptapContent(container.innerHTML), targets);
  const body = trimBody(converted);
  if (isEmptyBody(body)) return { skip: "empty page" };

  const guess = guessKind({ frontmatter: {}, templateHint: templateHint([title, baseName(path)]), tags: [], folders: folderOf(path) });
  const notes: string[] = [];
  if (imageCount) notes.push(`${imageCount} image${imageCount === 1 ? "" : "s"} not imported`);

  return {
    page: {
      ref: path,
      path,
      title,
      folders: folderOf(path),
      parentHint: null,
      kind: guess.kind,
      kindReason: guess.reason,
      tags: [],
      aliases: [],
      frontmatter: {},
      body: docOf(body),
      links: collectLinkTargets(body),
      notes,
      format: "html",
    },
  };
}
