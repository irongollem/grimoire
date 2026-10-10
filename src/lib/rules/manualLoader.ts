/**
 * Auto-discovers all Markdown files in src/manual/ and parses their YAML
 * frontmatter into structured page objects for ManualTab.
 *
 * Each .md file must start with a frontmatter block:
 *
 *   ---
 *   title: Page Title
 *   section: Section Name
 *   section_order: 1        # sort order of the section itself
 *   order: 2                # sort order within the section
 *   summary: One-liner shown under the title (optional)
 *   keywords: tag, bow, ammo  # comma-separated, used for search (optional)
 *   ---
 *
 *   Markdown body...
 */

import { marked } from "marked";
import { ANNOUNCEMENTS } from "@/lib/announcements";

export interface ManualPage {
  id: string;          // derived from filename
  title: string;
  section: string;
  sectionOrder: number;
  order: number;
  summary?: string;
  keywords: string[];
  html: string;        // rendered markdown body
}

export interface ManualSection {
  id: string;          // slugified section name
  title: string;
  order: number;
  pages: ManualPage[];
}

// Eagerly import every .md file in src/manual/ as a raw string.
const rawFiles = import.meta.glob("../../manual/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** YAML lets a value be quoted (titles with a colon must be); the quotes are
 *  syntax, not part of the value. Without this the index showed them. */
function unquote(val: string): string {
  if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1).replace(/\\"/g, '"');
  if (val.length >= 2 && val.startsWith("'") && val.endsWith("'")) return val.slice(1, -1).replace(/''/g, "'");
  return val;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    meta[key] = unquote(line.slice(colon + 1).trim());
  }
  return { meta, body: match[2] };
}

// A table can be wider than a phone; the wrapper is what scrolls sideways
// (ManualTab styles `.manual-table`), so the table itself keeps its full width.
function wrapTables(html: string): string {
  return html
    .replaceAll("<table>", '<div class="manual-table"><table>')
    .replaceAll("</table>", "</table></div>");
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * "What's New": every in-app announcement (src/lib/announcements.ts), newest
 * first, so a notice someone dismissed too quickly can still be read. Built
 * from the same list the banner uses, so there is nothing to keep in sync.
 */
export function whatsNewPage(): ManualPage {
  const entries = [...ANNOUNCEMENTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const date = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const html = entries.length
    ? entries
        .map(
          (a) =>
            `<h2>${escapeHtml(a.title)}</h2><p><em>${date(a.publishedAt)}</em></p><p>${escapeHtml(a.body)}</p>` +
            (a.action ? `<p><a href="${escapeHtml(a.action.to)}">${escapeHtml(a.action.label)} →</a></p>` : ""),
        )
        .join("")
    : "<p>Nothing announced yet.</p>";
  return {
    id: "whats-new",
    title: "What's New",
    section: "Getting Started",
    sectionOrder: 0,
    order: 0.5,
    summary: "Every notice shown at the top of the app, newest first.",
    keywords: ["what's new", "whats new", "changelog", "updates", "notices", "announcements"],
    html,
  };
}

function buildPages(): ManualSection[] {
  const pages: ManualPage[] = Object.entries(rawFiles).map(([path, raw]) => {
    const filename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
    const { meta, body } = parseFrontmatter(raw);

    return {
      id: slugify(meta.title ?? filename),
      title: meta.title ?? filename,
      section: meta.section ?? "General",
      sectionOrder: parseInt(meta.section_order ?? "99", 10),
      order: parseInt(meta.order ?? "99", 10),
      summary: meta.summary || undefined,
      keywords: meta.keywords ? meta.keywords.split(",").map((k) => k.trim().toLowerCase()) : [],
      html: wrapTables(marked(body, { async: false }) as string),
    };
  });

  pages.push(whatsNewPage());

  // Group into sections, preserving section order
  const sectionMap = new Map<string, ManualSection>();
  for (const page of pages) {
    const sectionId = slugify(page.section);
    if (!sectionMap.has(sectionId)) {
      sectionMap.set(sectionId, {
        id: sectionId,
        title: page.section,
        order: page.sectionOrder,
        pages: [],
      });
    }
    sectionMap.get(sectionId)!.pages.push(page);
  }

  // Sort sections, then pages within each section
  const sections = [...sectionMap.values()].sort((a, b) => a.order - b.order);
  for (const section of sections) {
    section.pages.sort((a, b) => a.order - b.order);
  }

  return sections;
}

export const manualSections: ManualSection[] = buildPages();
