import type { CombatantDef } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { EncounterCombatantAiResult } from "@/ai/types";

/**
 * App-side half of #337: the AI returns monster *names*, not ids. This
 * resolves each name against the DM's Bestiary to build real CombatantDef
 * rows for the encounter builder.
 *
 * Unmatched entries deliberately do NOT become a CombatantDef with a null
 * monster_id. EncounterRunView.vue builds run combatants with
 * `if (entry.monster_id) … else if (entry.npc_id) …` and no else branch, so
 * a stat-block-less stub would render fine in the builder and then be
 * silently dropped the moment the DM runs the encounter. Surfacing it as
 * "add manually" via `unmatched` is the honest option.
 */
export interface GeneratedCombatantMatch {
  def: CombatantDef;
  /** The version `def.monster_id` points at. */
  monster: Monster;
  /** Every monster that tied at the winning match tier, in bestiary order.
   *  Length > 1 means the name was ambiguous (#601): the same creature exists
   *  in more than one enabled sourcebook — each with its own stat block,
   *  because publishers rebalance — or the DM's homebrew shadows a library
   *  row. Retrieval dedupes by concept server-side, so the client cannot know
   *  which copy's CR the model budgeted against; the generator panel surfaces
   *  these as a version picker so the DM decides which stat block actually
   *  enters the encounter. */
  candidates: Monster[];
  /** Position of this entry in the AI result's combatants array. This is the
   *  ONLY identity that survives a re-resolve: the resolver runs inside a
   *  computed over the live Bestiary, so `def.id` is re-minted and matched
   *  indices shift whenever a monster elsewhere in the app is created or
   *  edited (the panel stays mounted in the background by design, and its
   *  own "add these manually" list invites exactly that). The panel keys
   *  both its rows and the DM's version picks on this. */
  entryIndex: number;
  /** The AI entry's trimmed role, kept so a version swap can rebuild
   *  `custom_name` (the role suffix) around the newly chosen monster's name. */
  role: string;
}

export interface ResolvedGeneratedCombatants {
  matched: GeneratedCombatantMatch[];
  unmatched: EncounterCombatantAiResult[];
}

const MIN_COUNT = 1;
const MAX_COUNT = 20;

/** Lowercased, alphanumeric-only, with a single trailing "s" dropped from
 *  the tail — turns "Goblins" into "goblin" and "dire-wolf" into "direwolf"
 *  so plurals and punctuation don't defeat an otherwise-good match. Only a
 *  single trailing "s" is stripped, so "Goblin Boss" survives untouched. */
function normalizeMonsterName(name: string): string {
  const stripped = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return stripped.endsWith("s") ? stripped.slice(0, -1) : stripped;
}

function addToBucket(map: Map<string, Monster[]>, key: string, monster: Monster): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(monster);
  else map.set(key, [monster]);
}

/** Among monsters tied at the same match tier, the DM's own homebrew
 *  (`user_id` a non-empty string) outranks a shared-library row
 *  (`user_id === ""`, per `useAllMonsters()`) — the DM's own creation should
 *  win over a library monster of the same name. Among equals, first in
 *  `monsters` wins; that ordering is preserved because each bucket is built
 *  by a single pass over `monsters`. */
function pickBest(candidates: Monster[]): Monster {
  return candidates.find((m) => m.user_id !== "") ?? candidates[0]!;
}

/** Clamps to the 1..20 range EncounterCombatants.vue's +/- control enforces.
 *  Non-finite or otherwise unusable input (missing/NaN from untrusted AI
 *  output) falls back to 1 rather than propagating a bad value. */
function clampCount(count: number): number {
  const safe = Number.isFinite(count) ? count : MIN_COUNT;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, safe));
}

function buildDef(id: string, monster: Monster, role: string, count: number): CombatantDef {
  return {
    id,
    monster_id: monster.id,
    npc_id: null,
    count: clampCount(count),
    faction_id: "enemy",
    // combatantLabel() renders `custom_name || monsterName`, so the role
    // rides along as a DM-visible tactical hint on the combatant row.
    custom_name: role.length > 0 ? `${monster.name} (${role})` : null,
  };
}

/** Rebuilds a match around another of its candidates (#601) — the DM picked a
 *  different sourcebook's version in the generator panel. Keeps the def's id
 *  and rebuilds everything derived from the monster, including the
 *  `custom_name` role suffix. An id that is not among the match's candidates
 *  returns the match unchanged: it is a stale pick — e.g. the picked
 *  version's sourcebook was disabled and it left the candidate set — and
 *  silently attaching an arbitrary monster id would recreate the exact
 *  mismatch this exists to close. */
export function swapCombatantVersion(
  match: GeneratedCombatantMatch,
  monsterId: string,
): GeneratedCombatantMatch {
  const monster = match.candidates.find((m) => m.id === monsterId);
  if (!monster || monster.id === match.monster.id) return match;
  return {
    ...match,
    monster,
    def: buildDef(match.def.id, monster, match.role, match.def.count),
  };
}

export function resolveGeneratedCombatants(
  aiCombatants: EncounterCombatantAiResult[],
  monsters: Monster[],
): ResolvedGeneratedCombatants {
  // Precompute all three lookup tiers once — the Bestiary can hold 3,500+
  // rows and this must not become an O(n) scan per AI entry.
  const exactMap = new Map<string, Monster[]>();
  const lowerMap = new Map<string, Monster[]>();
  const normalizedMap = new Map<string, Monster[]>();
  for (const monster of monsters) {
    addToBucket(exactMap, monster.name, monster);
    addToBucket(lowerMap, monster.name.toLowerCase(), monster);
    addToBucket(normalizedMap, normalizeMonsterName(monster.name), monster);
  }

  const matched: GeneratedCombatantMatch[] = [];
  const unmatched: EncounterCombatantAiResult[] = [];

  for (const [entryIndex, entry] of aiCombatants.entries()) {
    // First hit wins: exact → case-insensitive → normalized.
    const candidates =
      exactMap.get(entry.name) ??
      lowerMap.get(entry.name.toLowerCase()) ??
      normalizedMap.get(normalizeMonsterName(entry.name));

    if (!candidates || candidates.length === 0) {
      unmatched.push(entry);
      continue;
    }

    const monster = pickBest(candidates);
    const role = entry.role.trim();
    matched.push({
      def: buildDef(crypto.randomUUID(), monster, role, entry.count),
      monster,
      candidates,
      entryIndex,
      role,
    });
  }

  return { matched, unmatched };
}
