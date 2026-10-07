import { NPC_PLAYER_FIELDS, type NpcPlayerFieldKey } from "@/lib/npcDisplay";
import type { EntityEmbedType } from "@/lib/tiptap/nodeViewTypes";

/*
 * What sharing a handout reveals about each entity it embeds (#970).
 *
 * Stored on the `entityEmbed` node as `reveal`; `public.share_handout` reads
 * this exact JSON shape, so the interface below is a contract with the SQL and
 * changes here need a matching migration. `null` (the attribute's default) means
 * "automatic" and the SQL applies the same defaults `effectiveEmbedReveal`
 * spells out, so a handout written before this attribute existed shares the way
 * its author would expect without being re-saved.
 */
export interface EntityEmbedReveal {
  /** Reveal nothing: the embed is shared as a blank, which renders as absent. */
  off?: true;
  /** NPC only: the subset of NPC_PLAYER_FIELDS to reveal. */
  fields?: NpcPlayerFieldKey[];
  /** Monster only: also reveal its stat block (`discovered_monsters.reveal_stats`). */
  stats?: boolean;
  /** Location only: also share its description (`locations.is_description_shared`). */
  description?: boolean;
}

/** The slice of an embed node's attrs the reveal rules depend on. */
export interface EmbedRevealSubject {
  entityType: EntityEmbedType;
  showArt?: boolean;
  reveal?: EntityEmbedReveal | null;
}

/** The reveal a node resolves to once automatic defaults are filled in. */
export type EffectiveEmbedReveal =
  | { type: "npc"; fields: NpcPlayerFieldKey[] }
  | { type: "monster"; discover: boolean; stats: boolean }
  | { type: "location"; share: boolean; description: boolean }
  | { type: "quest"; start: boolean }
  // Items and spells are never revealed by sharing: a player sees an item once
  // the party holds it, and a spell is rules text, not a secret.
  | { type: "item" | "spell" };

const NPC_FIELD_KEYS = NPC_PLAYER_FIELDS.map((f) => f.key) as readonly NpcPlayerFieldKey[];

/** Tolerant reader for whatever came out of stored JSON or a `data-reveal`
 *  attribute: anything that is not a plain object becomes `null` (automatic). */
export function normalizeEmbedReveal(value: unknown): EntityEmbedReveal | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: EntityEmbedReveal = {};
  if (raw.off === true) out.off = true;
  if (Array.isArray(raw.fields)) {
    out.fields = NPC_FIELD_KEYS.filter((key) => (raw.fields as unknown[]).includes(key));
  }
  if (typeof raw.stats === "boolean") out.stats = raw.stats;
  if (typeof raw.description === "boolean") out.description = raw.description;
  return Object.keys(out).length ? out : null;
}

export function effectiveEmbedReveal(subject: EmbedRevealSubject): EffectiveEmbedReveal {
  const reveal = subject.reveal ?? null;
  const off = reveal?.off === true;
  switch (subject.entityType) {
    case "npc": {
      if (off) return { type: "npc", fields: [] };
      if (reveal?.fields) return { type: "npc", fields: [...reveal.fields] };
      return { type: "npc", fields: subject.showArt === false ? ["name"] : ["name", "portrait"] };
    }
    case "monster":
      return { type: "monster", discover: !off, stats: !off && reveal?.stats === true };
    case "location":
      return { type: "location", share: !off, description: !off && reveal?.description === true };
    case "quest":
      return { type: "quest", start: !off };
    case "item":
      return { type: "item" };
    case "spell":
      return { type: "spell" };
  }
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** One line of toolbar copy saying what sharing does for this embed. */
export function describeEmbedReveal(subject: EmbedRevealSubject): string {
  const effective = effectiveEmbedReveal(subject);
  switch (effective.type) {
    case "npc": {
      if (!effective.fields.length) return "Reveals nothing";
      const labelOf = new Map<NpcPlayerFieldKey, string>(NPC_PLAYER_FIELDS.map((f) => [f.key, f.label]));
      const labels = effective.fields.map((key) => (labelOf.get(key) ?? key).toLowerCase());
      return `Reveals ${listWords(labels)}`;
    }
    case "monster":
      if (!effective.discover) return "Reveals nothing";
      return effective.stats ? "Discovers it and reveals its stats" : "Discovers it";
    case "location":
      if (!effective.share) return "Reveals nothing";
      return effective.description ? "Shares it and its description" : "Shares it";
    case "quest":
      return effective.start ? "Starts the quest" : "Reveals nothing";
    case "item":
    case "spell":
      return "Shown once found";
  }
}

/** Whether the toolbar offers a reveal control at all for this entity type. */
export function embedHasRevealControl(type: EntityEmbedType): boolean {
  return type !== "item" && type !== "spell";
}
