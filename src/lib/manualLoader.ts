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
const rawFiles = import.meta.glob("../manual/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    meta[key] = val;
  }
  return { meta, body: match[2] };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
      html: marked(body, { async: false }) as string,
    };
  });

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
