/**
 * One Markdown file (Obsidian, our vault, or any plain `.md`) as a page.
 * Frontmatter is read for title / tags / aliases / kind hints; the body goes
 * through the shared Markdown converter with wikilinks and relative links
 * turned into `archiveLink` placeholders.
 */
import { markdownToTiptapNodes, type TiptapNode } from "@/lib/tiptap/markdownDocument";
import { frontmatterList, frontmatterString, splitFrontmatter } from "./frontmatter";
import { guessKind, tagsFromFrontmatter } from "./kindHints";
import { archiveLinkNode, collectLinkTargets, internalTarget } from "./links";
import { baseName, docOf, folderOf, isEmptyBody, plainTextOf, sameTitle, trimBody } from "./pageBuild";
import type { ArchivePage } from "./types";

export type PageDraft = Omit<ArchivePage, "parentRef"> & {
  /** Raw `parent:` frontmatter (a `[[wikilink]]` or a name), resolved to a `parentRef` once every page is known. */
  parentHint: string | null;
};

export type ParsedPage = { page: PageDraft } | { skip: string };

/** `[[Folder/Name|Alias]]` or plain text, as a link target. */
export function parentTargetOf(value: string): string {
  const wiki = /^\s*\[\[([^\]]+)\]\]\s*$/.exec(value);
  const inner = wiki ? wiki[1] : value;
  return inner.split("|")[0].split("#")[0].trim();
}

export function readMarkdownPage(path: string, text: string, templateHint: (candidates: string[]) => string | null): ParsedPage {
  const { data, body: markdown } = splitFrontmatter(text.replace(/\r\n?/g, "\n"));

  let embeds = 0;
  const nodes = markdownToTiptapNodes(markdown, {
    html: "strip",
    wikilink: ({ target, label, embed }) => {
      if (embed) {
        embeds++;
        return [];
      }
      // `[[#Heading]]` points inside this page: there is nothing to link to.
      if (!target) return { type: "text", text: label };
      return archiveLinkNode(target, label);
    },
    link: ({ href, label }) => {
      const target = internalTarget(href, path);
      return target && /\.(md|markdown)(#.*)?$/i.test(href.trim().split("?")[0]) ? archiveLinkNode(target, label) : null;
    },
  });

  // Title: frontmatter, then the first h1, then the file name.
  let title = frontmatterString(data.title) ?? frontmatterString(data.name);
  let body: TiptapNode[] = nodes;
  const h1Index = nodes.findIndex((n) => n.type === "heading" && (n.attrs as { level?: unknown } | undefined)?.level === 1);
  if (h1Index >= 0) {
    const h1Text = plainTextOf(nodes[h1Index]).trim();
    if (!title && h1Text) title = h1Text;
    // The heading is the page name repeated; the record already has a name field. Only the opening block is stripped.
    if (h1Index === 0 && title && sameTitle(h1Text, title)) body = nodes.slice(1);
  }
  body = trimBody(body);
  title = title ?? baseName(path);

  if (isEmptyBody(body)) return { skip: "empty page" };

  const frontmatter = data;
  const tags = tagsFromFrontmatter(frontmatter);
  const guess = guessKind({ frontmatter, templateHint: templateHint([title, baseName(path)]), tags, folders: folderOf(path) });
  const notes: string[] = [];
  if (embeds) notes.push(`${embeds} embed${embeds === 1 ? "" : "s"} dropped`);

  return {
    page: {
      ref: path,
      path,
      title,
      folders: folderOf(path),
      parentHint: frontmatterString(frontmatter.parent) ?? frontmatterString(frontmatter.up),
      kind: guess.kind,
      kindReason: guess.reason,
      tags,
      aliases: [...frontmatterList(frontmatter.aliases), ...frontmatterList(frontmatter.alias)],
      frontmatter,
      body: docOf(body),
      links: collectLinkTargets(body),
      notes,
      format: "markdown",
    },
  };
}
