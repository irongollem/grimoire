import { ingredientQualityModifier, qualityStepDown, QUALITY_LABELS } from "@/lib/items/quality";
import type { IngredientSlot } from "@/lib/crafting/ingredients";
import type { CraftingOutcome } from "@/types/crafting.types";
import type { ItemQuality } from "@/types/inventory.types";

/** Beating the DC by this much makes the result Fine (#1102): a clearly better job than "good enough". */
export const FINE_RESULT_MARGIN = 10;

/** A success that beat the DC by the margin; Masterwork is never crafted by a roll. */
export function isFineResult(outcome: CraftingOutcome, diff: number): boolean {
  return outcome === "success" && diff >= FINE_RESULT_MARGIN;
}

export interface SpentRow {
  name: string;
  quality: ItemQuality;
  qty: number;
}

/** The inventory rows a consumption plan names, with the quality and name the roll reads. */
export function spentRows(slots: readonly IngredientSlot[], consumption: readonly { id: string; qty: number }[]): SpentRow[] {
  const byId = new Map<string, { name: string; quality: ItemQuality }>();
  for (const s of slots) for (const c of s.candidates) if (!byId.has(c.inv.id)) byId.set(c.inv.id, { name: c.inv.name, quality: c.inv.quality });
  return consumption.flatMap(({ id, qty }) => {
    const row = byId.get(id);
    return row ? [{ ...row, qty }] : [];
  });
}

/** The roll modifier the spent rows contribute (0 when all are standard). */
export function spentQualityModifier(rows: readonly SpentRow[]): number {
  return ingredientQualityModifier(rows.map((r) => ({ quality: r.quality, qty: r.qty })));
}

/**
 * "Poor leather, fine ingots": the non-standard materials the roll reads, one phrase per
 * material and step, or null when every spent row is standard.
 */
export function qualityNote(rows: readonly SpentRow[]): string | null {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const r of rows) {
    if (r.quality === "standard") continue;
    const phrase = `${QUALITY_LABELS[r.quality].toLowerCase()} ${r.name.toLowerCase()}`;
    if (seen.has(phrase)) continue;
    seen.add(phrase);
    parts.push(phrase);
  }
  if (parts.length === 0) return null;
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + parts.slice(1).map((p) => `, ${p}`).join("");
}

/** What a failed attempt did to the primary ingredient, in plain words. */
export function degradeSentence(name: string, before: ItemQuality): string {
  const after = qualityStepDown(before);
  return after === "ruined" ? `Your ${name} is ruined.` : `Your ${name} is now ${QUALITY_LABELS[after]}.`;
}
