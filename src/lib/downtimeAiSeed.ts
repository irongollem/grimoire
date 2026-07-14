import { CONDITIONS } from "@/lib/conditions";
import { ITEM_RARITIES, ITEM_TYPES } from "@/types/item.types";
import type { ItemRarity, ItemType } from "@/types/item.types";
import type { NoteCategory } from "@/types/notes.types";
import type { NpcRelationship } from "@/types/npc.types";
import type {
  DowntimeEffect,
  DowntimeSeed,
  DowntimeSeedReward,
  DowntimeRewardType,
} from "@/types/downtime.types";

/**
 * Normalise an AI-drafted downtime outcome into a real `DowntimeSeed` (#486,
 * Phase 3).
 *
 * The model's JSON is **untrusted input**, not a typed value: it will invent
 * effect kinds, hallucinate conditions that aren't in the SRD, pick item types
 * that don't exist, and occasionally return the wrong reward kind entirely. This
 * module is the airlock — everything that survives it is a valid `DowntimeSeed`,
 * so the AI path can reuse the ordinary resolve flow (`drawFromDeck`'s output
 * shape) rather than growing a parallel one that skips our invariants.
 *
 * Policy: **drop what we can't trust, throw only on what we can't do without.**
 * A bogus effect is silently discarded (the DM never sees an effect we couldn't
 * honour); a missing title/vignette/reward means there is no outcome at all, so
 * that throws and the DM is told to try again.
 */

export class DowntimeAiParseError extends Error {}

const NOTE_CATEGORIES: readonly NoteCategory[] = [
  "general",
  "session",
  "lore",
  "quest",
  "faction",
];

const RELATIONSHIPS: readonly NpcRelationship[] = [
  "hostile",
  "unfriendly",
  "indifferent",
  "friendly",
  "helpful",
  "unknown",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** A required non-empty string. Absence is fatal — callers pass the field name. */
function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new DowntimeAiParseError(`The model returned no ${field}. Try drafting again.`);
  }
  return value.trim();
}

/** An optional string; blank/absent becomes null rather than an empty string. */
function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** A finite number, rounded to an integer. Anything else becomes `fallback`. */
function intOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Effects the model proposed, keeping only the three kinds the app can actually
 * apply, and only when they carry usable values. Everything arrives `applied:
 * false` — the DM ticks it, never the model.
 */
export function effectsFromAi(raw: unknown): DowntimeEffect[] {
  if (!Array.isArray(raw)) return [];

  const out: DowntimeEffect[] = [];
  for (const entry of raw) {
    const e = asRecord(entry);
    if (!e) continue;
    const note = optionalString(e.note);

    switch (e.kind) {
      case "gold": {
        const coins = {
          cp: intOr(e.cp, 0),
          sp: intOr(e.sp, 0),
          ep: intOr(e.ep, 0),
          gp: intOr(e.gp, 0),
          pp: intOr(e.pp, 0),
        };
        // An all-zero purse movement is not an effect; drop it rather than show
        // the DM a checkbox that does nothing.
        if (Object.values(coins).every((c) => c === 0)) continue;
        out.push({ kind: "gold", applied: false, note, ...coins });
        break;
      }
      case "hp": {
        const delta = intOr(e.delta, 0);
        if (delta === 0) continue;
        out.push({ kind: "hp", applied: false, note, delta });
        break;
      }
      case "condition": {
        // Only real SRD conditions — the model happily invents "Hungover".
        const match = (CONDITIONS as readonly string[]).find(
          (c) => typeof e.condition === "string" && c.toLowerCase() === e.condition.toLowerCase(),
        );
        if (!match) continue;
        out.push({ kind: "condition", applied: false, note, condition: match });
        break;
      }
      // `item` is deliberately unhandled: it needs an item_id we cannot mint from
      // prose, and no seed emits one. Any other kind is a hallucination.
      default:
        continue;
    }
  }
  return out;
}

/**
 * The reward entity. `expected` is the archetype's advertised reward type — the
 * model is told to honour it, and we hold it to that rather than letting a
 * Carouse draw quietly mint an item.
 */
export function rewardFromAi(raw: unknown, expected: DowntimeRewardType): DowntimeSeedReward {
  const r = asRecord(raw);
  if (!r) throw new DowntimeAiParseError("The model returned no reward. Try drafting again.");

  if (r.kind !== expected) {
    throw new DowntimeAiParseError(
      `The model drafted a ${String(r.kind)} reward for an archetype that yields ${expected}. Try drafting again.`,
    );
  }

  switch (expected) {
    case "npc": {
      const npc = asRecord(r.npc);
      if (!npc) throw new DowntimeAiParseError("The model returned no NPC. Try drafting again.");
      return {
        kind: "npc",
        npc: {
          name: requireString(npc.name, "NPC name"),
          race: optionalString(npc.race),
          alignment: optionalString(npc.alignment),
          occupation: optionalString(npc.occupation),
          appearance: optionalString(npc.appearance),
          personality: optionalString(npc.personality),
          backstory: optionalString(npc.backstory),
          relationship: oneOf<NpcRelationship>(npc.relationship, RELATIONSHIPS, "indifferent"),
          tags: stringArray(npc.tags),
          // An AI-drafted contact has no canonical seed art. We never let the
          // model supply a URL — that would be an unvalidated remote reference.
          portrait_url: null,
        },
      };
    }
    case "item": {
      const item = asRecord(r.item);
      if (!item) throw new DowntimeAiParseError("The model returned no item. Try drafting again.");
      return {
        kind: "item",
        item: {
          name: requireString(item.name, "item name"),
          item_type: oneOf<ItemType>(item.item_type, ITEM_TYPES, "gear"),
          subtype: optionalString(item.subtype),
          // Downtime does not mint legendaries by accident; an unrecognised
          // rarity falls back to mundane rather than to something powerful.
          rarity: oneOf<ItemRarity>(item.rarity, ITEM_RARITIES, "mundane"),
          requires_attunement: item.requires_attunement === true,
          weight: typeof item.weight === "number" && Number.isFinite(item.weight) ? item.weight : null,
          cost: optionalString(item.cost),
          description: requireString(item.description, "item description"),
          tags: stringArray(item.tags),
          // Same rule as the NPC branch: never take a URL from the model.
          image_url: null,
        },
      };
    }
    case "note": {
      const note = asRecord(r.note);
      if (!note) throw new DowntimeAiParseError("The model returned no note. Try drafting again.");
      return {
        kind: "note",
        note: {
          title: requireString(note.title, "note title"),
          body: requireString(note.body, "note body"),
          category: oneOf<NoteCategory>(note.category, NOTE_CATEGORIES, "general"),
          tags: stringArray(note.tags),
        },
      };
    }
    default:
      // The archetype advertises a reward type we have no builder for. This is
      // our bug, not the model's — fail loudly rather than mint the wrong thing.
      throw new DowntimeAiParseError(
        `No AI reward builder for reward type "${expected}".`,
      );
  }
}

/**
 * The whole outcome, as a `DowntimeSeed` the resolve flow can consume unchanged.
 *
 * `weight` is 1 and unused — an AI seed is handed straight to the panel, never
 * put back in the weighted pool — but the shape stays honest so the seed is
 * indistinguishable downstream.
 */
export function seedFromAiResult(
  raw: unknown,
  activityKey: string,
  expectedReward: DowntimeRewardType,
): DowntimeSeed {
  const r = asRecord(raw);
  if (!r) throw new DowntimeAiParseError("The model returned nothing usable. Try drafting again.");

  return {
    id: `ai:${activityKey}`,
    activityKey,
    weight: 1,
    title: requireString(r.title, "title"),
    vignette: requireString(r.vignette, "vignette"),
    // An AI-drafted outcome has no canonical card art — never take a URL from
    // the model. It renders the archetype glyph face.
    artUrl: null,
    proposedEffects: effectsFromAi(r.proposed_effects),
    reward: rewardFromAi(r.reward, expectedReward),
  };
}
