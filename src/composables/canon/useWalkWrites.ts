import { useQueryClient } from "@tanstack/vue-query";
import { useCampaignStore } from "@/stores/campaign";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { createCanonEntry, updateCanonEntry, useCanonEntries } from "@/composables/canon/useCanonEntries";
import { createCanonArc, useCanonArcs } from "@/composables/canon/useCanonArcs";
import { openBackstory } from "@/composables/canon/useBackstory";
import { createCanonPassage } from "@/lib/canon/canonPassageWrites";
import { plainTextToTiptap } from "@/lib/canon/canonParts";
import { stepOf, type WalkStopRef } from "@/lib/canon/canonWalk";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { CanonEntry, PremiseKind } from "@/types/canon.types";

/**
 * "Write it myself" in the Familiar's walk (#1282): the DM's answer becomes the section as it stands, no model asked.
 * One function per step shape, over what the canon holds now; a write that fails throws, and the block says so.
 */

export interface WalkWriteContext {
  campaignId: string;
  entries: readonly CanonEntry[];
  arcCount: number;
  /** A character's backstory entry id, made on first use (the definer `open_backstory`). */
  openBackstory: (memberId: string) => Promise<string>;
}

/** The non-empty lines of an answer, each without a list marker the DM may have typed. */
export function linesOf(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/^[-*•]\s+/, "").trim())
    .filter((l) => l !== "");
}

const VEIL = /^veil:\s*/i;

const hasWords = (e: CanonEntry): boolean => e.title.trim() !== "" || tiptapToPlainText(e.body).trim() !== "";

/** The premise entries of one kind, in order. */
const premiseOf = (entries: readonly CanonEntry[], kind: PremiseKind): CanonEntry[] =>
  entries.filter((e) => e.part === "premise" && e.premise_kind === kind);

/**
 * A one-text premise field (the pitch's body, the voice's or the look's title): made, or put into an empty one. Words
 * already written are replaced only when the caller says so, so a walk never overwrites what the DM wrote.
 */
async function writeSingle(ctx: WalkWriteContext, kind: "pitch" | "voice" | "look", text: string, replace: boolean): Promise<void> {
  const existing = premiseOf(ctx.entries, kind)[0];
  const asBody = kind === "pitch";
  if (existing !== undefined) {
    if (hasWords(existing) && !replace) throw new Error(`The ${kind} is already written. Replace it from its chapter, or skip this step.`);
    await updateCanonEntry(existing.id, asBody ? { body: plainTextToTiptap(text) } : { title: text });
    return;
  }
  await createCanonEntry(ctx.campaignId, asBody
    ? { part: "premise", premise_kind: kind, body: plainTextToTiptap(text), sort_order: 0 }
    : { part: "premise", premise_kind: kind, title: text, sort_order: 0 });
}

async function writeLines(lines: readonly string[], make: (line: string, order: number) => Promise<unknown>, already: number): Promise<void> {
  // One at a time, in order: sort_order is the DM's order, and a failure part-way leaves the lines before it written.
  for (const [i, line] of lines.entries()) await make(line, already + i);
}

export async function writeWalk(ctx: WalkWriteContext, stop: WalkStopRef, text: string, { replace = false }: { replace?: boolean } = {}): Promise<void> {
  const body = text.trim();
  if (body === "") throw new Error("Write a few words first.");
  const lines = linesOf(body);
  const { campaignId, entries } = ctx;
  const count = (part: CanonEntry["part"]) => entries.filter((e) => e.part === part).length;

  switch (stop.step) {
    case "pitch":
    case "voice":
    case "look":
      return writeSingle(ctx, stop.step, stop.step === "pitch" ? body : lines.join(" "), replace);
    case "themes":
    case "table": {
      const kind = stop.step === "themes" ? "theme" : "table";
      return writeLines(lines, (title, sort_order) => createCanonEntry(campaignId, { part: "premise", premise_kind: kind, title, sort_order }), premiseOf(entries, kind).length);
    }
    case "lines":
      return writeLines(
        lines,
        (line, sort_order) => {
          const veil = VEIL.test(line);
          return createCanonEntry(campaignId, { part: "premise", premise_kind: veil ? "veil" : "line", title: veil ? line.replace(VEIL, "").trim() : line, sort_order });
        },
        premiseOf(entries, "line").length + premiseOf(entries, "veil").length,
      );
    case "truths":
      // A truth the DM states is known to all: it is simply so, and players may read it.
      return writeLines(lines, (title, sort_order) => createCanonEntry(campaignId, { part: "truth", knowledge: "all", title, sort_order }), count("truth"));
    case "forces":
    case "secrets":
    case "questions":
    case "lore": {
      const part = stop.step === "forces" ? "force" : stop.step === "secrets" ? "secret" : stop.step === "questions" ? "question" : "lore";
      return writeLines(lines, (title, sort_order) => createCanonEntry(campaignId, { part, title, sort_order }), count(part));
    }
    case "arcs":
      return writeLines(lines, (name, sort_order) => createCanonArc(campaignId, { name, sort_order }), ctx.arcCount);
    case "backstories": {
      if (stop.memberId === null) throw new Error("A backstory is written for one character.");
      const memberId = stop.memberId;
      const entryId = entries.find((e) => e.part === "backstory" && e.party_member_id === memberId)?.id ?? (await ctx.openBackstory(memberId));
      // The DM's own passage, untold: it is told afterwards like any lore, by hand or at a place.
      await createCanonPassage(campaignId, { entry_id: entryId, title: "Notes", body: plainTextToTiptap(body), player_visible_to: [] });
      return;
    }
    case "peoples":
    case "habitats":
      throw new Error(`${stepOf(stop.step).title} are written in their chapter.`);
  }
}

export function useWalkWrites() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  const { data: entries } = useCanonEntries();
  const { data: arcs } = useCanonArcs();

  async function write(stop: WalkStopRef, text: string, options: { replace?: boolean } = {}): Promise<void> {
    const campaignId = campaign.activeCampaignId;
    if (campaignId === null) throw new Error("Pick a campaign first.");
    if (entries.value === undefined || arcs.value === undefined) throw new Error("Your canon is still loading. Try again in a moment.");
    try {
      await writeWalk({ campaignId, entries: entries.value, arcCount: arcs.value.length, openBackstory }, stop, text, options);
    } finally {
      // Whatever part-way a write got is on the page too.
      await qc.invalidateQueries({ queryKey: [CANON_KEY] });
    }
  }

  return { write };
}
