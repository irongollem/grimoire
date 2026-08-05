import type { ComplicationAiResult } from "./types";
import type { EncounterEvent, EventAction, FactionDef, SpawnDef } from "@/types/encounter.types";

/**
 * App-side half of #604: the complication generator returns creature *names*
 * and a free-text side, not ids. This resolves them against the running
 * encounter's own rosters and produces a preview the DM approves BEFORE
 * anything is added to the encounter.
 *
 * Same resolution-guard principle as resolveGeneratedCombatants (#337) and
 * resolveGeneratedLoot (#602): an unmatched name is never dropped and never
 * becomes a stat-block-less stub. It comes back as an `unmatched` row so the
 * panel can show the DM what the model asked for and why it cannot happen.
 *
 * The other half of its job is refusing to over-deliver. The DM's stated fear
 * is "all sorts of things happen I didn't want", so every quantity here is
 * clamped, every side is resolved to a faction that actually exists in this
 * encounter, and the event this builds is always `manual` + `fire_once` — the
 * model is never asked for a trigger and none is ever read from it.
 */

/** Minimal shape this module needs from a roster — `Monster` and `Npc` rows both satisfy it. */
export interface CombatantPoolRow {
  id: string;
  name: string;
}

export interface ComplicationPools {
  /** The DM's bestiary as the runner has it loaded (store.availableMonsters). */
  monsters: CombatantPoolRow[];
  /** The campaign's NPCs as the runner has them loaded (store.availableNpcs). */
  npcs: CombatantPoolRow[];
  /** The encounter's own factions — the only sides a spawn may join. */
  factions: FactionDef[];
}

export type ResolvedReinforcement =
  | {
    kind: "monster" | "npc";
    id: string;
    /** The roster row's name, which may differ in case from what the model wrote. */
    name: string;
    count: number;
    factionId: string;
    factionName: string;
    /** Short label shown on the token, or null. */
    role: string | null;
  }
  | {
    kind: "unmatched";
    /** What the model asked for, verbatim, for the DM to read. */
    name: string;
    reason: string;
  };

export interface ResolvedComplication {
  /** Event name for the runner's EVENTS list. */
  name: string;
  /** Read-aloud text; broadcast when the DM fires the event. */
  narration: string;
  reinforcements: ResolvedReinforcement[];
  environment: { label: string; description: string } | null;
  /**
   * Things that were silently impossible, made loud. Rendered in the preview
   * so a proposal that quietly lost half its content cannot look complete.
   */
  warnings: string[];
}

/** No more than this many creatures from a single entry, whatever the model
 *  asked for. The prompt says 1–4; this is the backstop that keeps a stray
 *  "count": 20 from putting twenty initiative slots on the DM's tracker. */
const MAX_COUNT_PER_ENTRY = 8;

/** And no more than this many entries, for the same reason at the other axis. */
const MAX_REINFORCEMENT_ENTRIES = 6;

function cleanString(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildNameIndex(pool: CombatantPoolRow[]): Map<string, CombatantPoolRow> {
  const index = new Map<string, CombatantPoolRow>();
  for (const row of pool) {
    const key = row.name.trim().toLowerCase();
    if (!index.has(key)) index.set(key, row);
  }
  return index;
}

/**
 * Which side a spawn joins.
 *
 * Resolved against the encounter's OWN factions rather than trusted from the
 * model: a spawn carrying a faction_id that no combatant row shares would
 * render with no colour stripe and sit outside every hostility relationship,
 * which looks like a rendering bug rather than the data error it is. An
 * unrecognised side falls back to the encounter's enemy faction — the safe
 * assumption for something arriving mid-fight, and visible to the DM in the
 * preview either way.
 */
function resolveFaction(side: unknown, factions: FactionDef[]): FactionDef | null {
  const wanted = cleanString(side)?.toLowerCase();
  if (wanted) {
    const byName = factions.find((f) => f.name.trim().toLowerCase() === wanted);
    if (byName) return byName;
    const byId = factions.find((f) => f.id.toLowerCase() === wanted);
    if (byId) return byId;
  }
  return factions.find((f) => f.id === "enemy")
    ?? factions.find((f) => f.id !== "players")
    ?? null;
}

/** A resolved entry plus anything the DM should be told about how it changed
 *  on the way through — returned together so the caller never has to re-derive
 *  what the model originally asked for. */
interface ReinforcementResolution {
  entry: ResolvedReinforcement;
  warning?: string;
}

function resolveReinforcement(
  entry: { name: string; count?: number; side?: string; role?: string | null },
  monsterIndex: Map<string, CombatantPoolRow>,
  npcIndex: Map<string, CombatantPoolRow>,
  factions: FactionDef[],
): ReinforcementResolution {
  const requested = cleanString(entry.name);
  if (!requested) {
    return { entry: { kind: "unmatched", name: "(unnamed)", reason: "no creature name given" } };
  }

  const key = requested.toLowerCase();
  // Bestiary first, NPCs second. A name in both is almost always a homebrew
  // stat block the DM wrote FOR that character, and combat wants the stat
  // block: an NPC combatant without one has nothing to attack with.
  const monster = monsterIndex.get(key);
  const npc = monster ? undefined : npcIndex.get(key);
  const match = monster ?? npc;
  if (!match) {
    return {
      entry: { kind: "unmatched", name: requested, reason: "not in this encounter's bestiary or cast" },
    };
  }

  const faction = resolveFaction(entry.side, factions);
  if (!faction) {
    // An encounter with no factions at all cannot place a combatant anywhere.
    // Vanishingly rare (the builder seeds four), but silently dropping the
    // spawn would be the worst possible handling of it.
    return {
      entry: { kind: "unmatched", name: requested, reason: "this encounter has no side to add them to" },
    };
  }

  const rawCount = typeof entry.count === "number" && Number.isFinite(entry.count)
    ? Math.round(entry.count)
    : 1;
  const count = Math.min(MAX_COUNT_PER_ENTRY, Math.max(1, rawCount));

  return {
    entry: {
      kind: monster ? "monster" : "npc",
      id: match.id,
      name: match.name,
      count,
      factionId: faction.id,
      factionName: faction.name,
      role: cleanString(entry.role),
    },
    warning: rawCount > MAX_COUNT_PER_ENTRY
      ? `${match.name}: the AI asked for ${rawCount}, capped at ${MAX_COUNT_PER_ENTRY}.`
      : undefined,
  };
}

export function resolveGeneratedComplication(
  result: ComplicationAiResult,
  pools: ComplicationPools,
): ResolvedComplication {
  const monsterIndex = buildNameIndex(pools.monsters);
  const npcIndex = buildNameIndex(pools.npcs);
  const warnings: string[] = [];

  const rawEntries = Array.isArray(result.reinforcements) ? result.reinforcements : [];
  if (rawEntries.length > MAX_REINFORCEMENT_ENTRIES) {
    warnings.push(
      `The AI proposed ${rawEntries.length} groups of reinforcements; only the first ${MAX_REINFORCEMENT_ENTRIES} are kept.`,
    );
  }
  const resolutions = rawEntries
    .slice(0, MAX_REINFORCEMENT_ENTRIES)
    .map((entry) => resolveReinforcement(entry, monsterIndex, npcIndex, pools.factions));
  const reinforcements = resolutions.map((r) => r.entry);
  for (const { warning } of resolutions) if (warning) warnings.push(warning);

  // An environment effect needs both halves to be usable: a label with no
  // description is an unexplained hazard, and a description with no label has
  // nothing to pin in the runner. Half of one is dropped — loudly.
  let environment: ResolvedComplication["environment"] = null;
  const envLabel = cleanString(result.environment?.label);
  const envDescription = cleanString(result.environment?.description);
  if (envLabel && envDescription) {
    environment = { label: envLabel, description: envDescription };
  } else if (envLabel || envDescription) {
    warnings.push("The AI's environmental effect was incomplete and has been left out.");
  }

  return {
    name: cleanString(result.name) ?? "Complication",
    narration: cleanString(result.narration) ?? "",
    reinforcements,
    environment,
    warnings,
  };
}

/**
 * Turn an approved preview into the `EncounterEvent` the runner stores.
 *
 * `manual` + `fire_once`, always and non-negotiably: `checkEvents` only
 * auto-fires non-manual triggers, so a generated event physically cannot go
 * off on a round boundary while the DM is still deciding about it. Unmatched
 * reinforcements are not represented at all — they were shown in the preview
 * and stay out of the encounter rather than becoming spawns that resolve to
 * nothing at fire time.
 */
export function buildComplicationEvent(
  resolved: ResolvedComplication,
  opts: { isPlayerVisible: boolean },
): EncounterEvent {
  const actions: EventAction[] = [];

  if (resolved.narration) {
    actions.push({ type: "broadcast_message", message: resolved.narration });
  }

  const spawns: SpawnDef[] = resolved.reinforcements
    .filter((r): r is Extract<ResolvedReinforcement, { kind: "monster" | "npc" }> => r.kind !== "unmatched")
    .map((r) => ({
      monster_id: r.id,
      kind: r.kind,
      count: r.count,
      faction_id: r.factionId,
      ...(r.role ? { custom_name: r.role } : {}),
    }));
  if (spawns.length > 0) actions.push({ type: "spawn_combatants", spawns });

  if (resolved.environment) {
    actions.push({
      type: "environment_effect",
      label: resolved.environment.label,
      description: resolved.environment.description,
    });
  }

  return {
    id: crypto.randomUUID(),
    name: resolved.name,
    trigger: { type: "manual" },
    actions,
    fire_once: true,
    is_player_visible: opts.isPlayerVisible,
  };
}
