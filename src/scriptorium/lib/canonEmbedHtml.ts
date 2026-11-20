/*
 * What a linked canon entry prints as (#1226 story 8): a truth as one line, lore
 * as its title, kind and date with its passages under their headings, a force as
 * who, wants and steps, a secret as its statement with its clues and where they
 * lie, a question as one line.
 *
 * One formatter for both readers. The DM's resolver and the players' resolver each
 * decide what goes IN (a player is handed only the passages they were told and only
 * truths and lore); this module only sets what it is given, so it can never print a
 * field its caller did not pass. It reuses the codex entry classes the theme already
 * styles (`sc-codex-entry`) rather than inventing a second look.
 */
import { escapeHtml } from "@/lib/escapeHtml";
import { richTextOrPlain } from "@/scriptorium/lib/scriptoriumImport";
import { LORE_KIND_LABEL } from "@/lib/canon/canonLore";
import type { LoreKind } from "@/types/canon.types";

export interface CanonPassageInput {
  title: string;
  body: string | null;
}

export type CanonEmbedInput =
  | { kind: "premise"; label: string; title: string; body: string | null }
  | { kind: "truth"; title: string }
  | {
      kind: "lore";
      title: string;
      loreKind: LoreKind | null;
      /** The date in the world as the campaign's calendar words it; null for undated lore. */
      date: string | null;
      body: string | null;
      /** In order. A player's list holds only what they were told. */
      passages: CanonPassageInput[];
    }
  | { kind: "force"; title: string; wants: string | null; steps: string[] }
  | { kind: "secret"; title: string; clues: { title: string; where: string | null }[] }
  | { kind: "question"; title: string };

function wrap(kind: string, inner: string): string {
  return `<div class="sc-codex-entry sc-codex-entry--canon sc-codex-entry--canon-${kind}">\n${inner}</div>\n`;
}

function line(text: string): string {
  return `<p>${escapeHtml(text)}</p>\n`;
}

export function canonEmbedHtml(input: CanonEmbedInput): string {
  switch (input.kind) {
    case "truth":
      return wrap("truth", line(input.title));
    case "question":
      return wrap("question", line(input.title));
    case "premise": {
      const label = `<p class="sc-codex-entry-type"><em>${escapeHtml(input.label)}</em></p>\n`;
      return wrap("premise", `${label}${input.title ? line(input.title) : ""}${richTextOrPlain(input.body)}`);
    }
    case "lore": {
      const typeLine = [input.loreKind ? LORE_KIND_LABEL[input.loreKind] : null, input.date]
        .filter((part): part is string => !!part)
        .join(" · ");
      let html = `<h3 class="sc-codex-entry-name">${escapeHtml(input.title)}</h3>\n`;
      if (typeLine) html += `<p class="sc-codex-entry-type"><em>${escapeHtml(typeLine)}</em></p>\n`;
      html += richTextOrPlain(input.body);
      for (const passage of input.passages) {
        if (passage.title) html += `<h4 class="sc-codex-entry-section">${escapeHtml(passage.title)}</h4>\n`;
        html += richTextOrPlain(passage.body);
      }
      return wrap("lore", html);
    }
    case "force": {
      let html = `<h3 class="sc-codex-entry-name">${escapeHtml(input.title)}</h3>\n`;
      if (input.wants?.trim()) html += `<p><strong>Wants</strong> ${escapeHtml(input.wants)}</p>\n`;
      if (input.steps.length > 0) {
        html += `<p><strong>Next</strong></p>\n<ol>${input.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>\n`;
      }
      return wrap("force", html);
    }
    case "secret": {
      let html = `<h3 class="sc-codex-entry-name">${escapeHtml(input.title)}</h3>\n`;
      if (input.clues.length > 0) {
        const items = input.clues
          .map((c) => `<li>${escapeHtml(c.title)}${c.where ? ` <em>(${escapeHtml(c.where)})</em>` : ""}</li>`)
          .join("");
        html += `<p><strong>Clues</strong></p>\n<ul>${items}</ul>\n`;
      }
      return wrap("secret", html);
    }
  }
}
