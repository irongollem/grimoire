import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tocBlock: {
      insertTocBlock: () => ReturnType;
    };
  }
}

/**
 * Table of Contents block — atom node that acts as a live TOC placeholder.
 *
 * In the Tiptap editor it renders a dashed box labelled "Table of Contents".
 *
 * In the preview and PDF export a pre-pass (`buildTocHtml`) walks the page
 * HTML, extracts all H1/H2/H3 headings with their page indices, and replaces
 * the `<nav data-type="toc">` placeholder with a fully-rendered
 * `<nav class="sc-toc"><ol>…</ol></nav>` block.
 *
 * The TOC itself does not count as a heading source — headings inside the
 * rendered TOC are skipped by the pre-pass (the placeholder emits none).
 *
 * Page numbering: pages are split at top-level `<hr>` tags (same as the
 * `pages` computed in ScriptoriumEditor.vue). The page containing the TOC
 * placeholder is treated as page "i" (roman numeral) and excluded from
 * body page numbering so body pages start at 1.
 */
export const TocBlock = Node.create({
  name: "tocBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'nav[data-type="toc"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "nav",
      mergeAttributes({ "data-type": "toc", class: "sc-toc-placeholder" }, HTMLAttributes),
      // Text content shown only in the editor via CSS ::after
    ];
  },

  addCommands() {
    return {
      insertTocBlock:
        () =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name });
        },
    };
  },
});

// ── TOC pre-pass ──────────────────────────────────────────────────────────────

interface TocEntry {
  level: 1 | 2 | 3;
  text: string;
  /** 1-based page index (body pages only; TOC page excluded). */
  page: number;
}

/**
 * Extract the plain text from an HTML fragment without executing scripts.
 * Uses DOMParser so it runs only in a browser context.
 */
function extractText(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
}

/**
 * Convert a 1-based integer to a roman numeral (lowercase).
 * Used to label the TOC page itself (future: show "i" in footer).
 * Returns the integer itself as a string for values > 10.
 */
export function toRoman(n: number): string {
  const MAP: [number, string][] = [
    [10, "x"], [9, "ix"], [8, "viii"], [7, "vii"],
    [6, "vi"], [5, "v"], [4, "iv"], [3, "iii"],
    [2, "ii"], [1, "i"],
  ];
  let result = "";
  for (const [val, sym] of MAP) {
    while (n >= val) { result += sym; n -= val; }
  }
  return result || String(n);
}

/**
 * Build the rendered TOC HTML from a list of pages.
 *
 * Algorithm:
 * 1. Find the first page that contains a `<nav data-type="toc">` — that is
 *    the TOC page. It gets roman-numeral label(s) and is excluded from body
 *    page counting.
 * 2. For all other pages (body pages), scan for H1/H2/H3 elements and record
 *    them with their 1-based body page number.
 * 3. Replace the placeholder with a rendered `<nav class="sc-toc">` containing
 *    a two-column `<ol>` with dotted leaders.
 *
 * Returns the pages array with the placeholder replaced.
 */
export function buildTocPages(pages: string[]): string[] {
  // Find TOC page index
  const tocPageIdx = pages.findIndex((p) =>
    p.includes('data-type="toc"'),
  );
  if (tocPageIdx === -1) return pages; // no TOC block — nothing to do

  // Collect headings from non-TOC pages
  const entries: TocEntry[] = [];
  let bodyPageNum = 0;
  pages.forEach((pageHtml, idx) => {
    if (idx === tocPageIdx) return; // skip TOC page

    bodyPageNum++;
    const container = document.createElement("div");
    container.innerHTML = pageHtml;

    container.querySelectorAll("h1, h2, h3").forEach((el) => {
      const tag = el.tagName.toLowerCase() as "h1" | "h2" | "h3";
      const level = parseInt(tag[1], 10) as 1 | 2 | 3;
      const text = el.textContent?.trim() ?? "";
      if (!text) return;
      entries.push({ level, text, page: bodyPageNum });
    });
  });

  // Build the rendered TOC HTML — label the TOC page with a roman numeral
  const tocPageLabel = toRoman(tocPageIdx + 1);
  const tocHtml = renderTocHtml(entries, tocPageLabel);

  // Replace placeholder in the TOC page
  const updatedPages = [...pages];
  updatedPages[tocPageIdx] = updatedPages[tocPageIdx].replace(
    /<nav[^>]*data-type="toc"[^>]*>[\s\S]*?<\/nav>/i,
    tocHtml,
  );

  return updatedPages;
}

/**
 * Render the TOC nav HTML from the collected entries.
 * `tocPageLabel` is the roman-numeral label for the TOC page itself
 * (shown in the Contents heading, e.g. "Contents — i").
 */
function renderTocHtml(entries: TocEntry[], tocPageLabel: string): string {
  if (entries.length === 0) {
    return `<nav class="sc-toc"><p class="sc-toc-empty">No headings found.</p></nav>`;
  }

  const items = entries
    .map((e) => {
      const indent = e.level === 1 ? "" : e.level === 2 ? "sc-toc-h2" : "sc-toc-h3";
      const anchor = `sc-page-${e.page}`;
      return `<li class="sc-toc-item ${indent}"><a href="#${anchor}" class="sc-toc-link"><span class="sc-toc-text">${escapeHtml(e.text)}</span><span class="sc-toc-leader" aria-hidden="true"></span><span class="sc-toc-page">${e.page}</span></a></li>`;
    })
    .join("\n");

  const headingLabel = tocPageLabel ? `Contents — ${tocPageLabel}` : "Contents";
  return `<nav class="sc-toc" aria-label="Table of Contents"><h2 class="sc-toc-heading">${headingLabel}</h2><ol class="sc-toc-list">\n${items}\n</ol></nav>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inject `id="sc-page-{n}"` anchors onto each body page div in the PDF
 * render holder so that internal PDF links work.
 *
 * Called by `buildPdfBlob` after appending page elements to the holder.
 * `tocPageIdx` is the 0-based index of the TOC page (-1 if none).
 */
export function injectPageAnchors(
  pageEls: HTMLElement[],
  tocPageIdx: number,
): void {
  let bodyPageNum = 0;
  pageEls.forEach((el, idx) => {
    if (idx === tocPageIdx) return;
    bodyPageNum++;
    el.id = `sc-page-${bodyPageNum}`;
  });
}

// Re-export helper used in composable
export { extractText };
