// ── The room's own stack: what to Trigger, Run, Reveal, Roll and hand over
// (#868, S11, frame 11 "What the DM reads when the party enters a room") ────
//
// The maintainer's framing for this story: "a room or other subpart from a
// site is a zoomed in beat, so we need to be smart and re-use a lot of beat
// concepts that make sense for a room." A room's description is already its
// read-aloud and its placements are already its attachments — this module is
// the one new thing a room needs of its own: the ordered list of what bites,
// what fights, what hides, what to roll, and what to hand over, resolved from
// the same prep rows the Prepared layer already draws on the map
// (`resolvePreparedMarks`), pure and colocated-tested the same way.
//
// Order is fixed — traps, then encounters, then hidden things, then roll
// tables, then loot — because that is the order a DM actually needs to know
// about a room in: what can hurt the party on entry, what they might have to
// fight, what they might find, what randomness is on offer, and finally what
// they walk out with.

import { placementKind } from "@/types/locationPlacement.types";
import type { LocationPlacementWithEntity } from "@/composables/locations/useLocationPlacements";
import type { Trap } from "@/types/trap.types";
import type { DungeonFeature } from "@/types/dungeonFeature.types";
import type { Encounter } from "@/types/encounter.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { LootPlacement } from "@/types/quest.types";
import type { DoorPerspectiveRow } from "@/lib/locations/doors";

export type RoomStackKind = "trap" | "encounter" | "hidden" | "roll_table" | "loot";
export type RoomStackAction = "trigger" | "run" | "reveal" | "roll" | "drop";

/**
 * One prompt in the room's stack. `target`'s shape depends on `action`: a
 * route for `trigger`/`run` (there is nothing to act on but looking, so the
 * "action" is a link), a door id for `reveal`, a roll table id for `roll`,
 * a loot placement id for `drop`.
 */
export interface RoomStackRow {
  id: string;
  kind: RoomStackKind;
  label: string;
  subtitle: string;
  action: RoomStackAction;
  target: string;
}

/** The fields a secret way out is scanned for — the same structural
 *  convention `DoorEdge` (`siteRun.ts`) and `DoorPerspectiveRow`
 *  (`doors.ts`) already set, so `SiteDoorWithSpaces` satisfies this without
 *  a cast. */
export interface HiddenDoorRow extends DoorPerspectiveRow {
  id: string;
  label: string;
  is_secret: boolean;
  dungeon_feature_id: string | null;
}

export interface RoomStackInput {
  roomId: string;
  /** This room's own placements (a room's page already scopes
   *  `useLocationPlacements` to one location, same shape). */
  placements: readonly LocationPlacementWithEntity[];
  traps: readonly Pick<Trap, "id" | "name" | "detection_dc">[];
  features: readonly Pick<DungeonFeature, "id" | "name" | "investigation_dc" | "perception_dc">[];
  /** The whole campaign's encounters — filtered to this room internally,
   *  same convention `useSitePrepared` reads. */
  encounters: readonly Pick<Encounter, "id" | "name" | "location_id" | "combatants">[];
  /** Every zone region of this site (`region_role === "zone"`). */
  zones: readonly LocationMapRegion[];
  /** This room's own bound `space` region — its cells are what a zone must
   *  intersect to prompt from inside this room. Undefined for a room with no
   *  traced shape yet: nothing intersects, so no zone can resolve to it. */
  roomRegion: LocationMapRegion | undefined;
  /** This room's own "ways out" — `doorsOfSpace(siteDoors, roomId)` already
   *  merges outgoing with bidirectional incoming, the ways-out panel's own
   *  perspective, so a secret door reachable from either side of this room
   *  is caught once rather than twice. */
  doors: readonly HiddenDoorRow[];
  /** Whether a door's `found` fact has been asserted true — once it has, the
   *  door is an ordinary way out (the ways-out panel's own rule) and drops
   *  out of "what hides" here. */
  doorFound: (doorId: string) => boolean;
  /** This room's own loot. */
  loot: readonly Pick<LootPlacement, "id" | "location_id" | "label" | "kind" | "quantity" | "delivery_state">[];
}

function passivePhrase(dc: number | null): string | null {
  return dc == null ? null : `Passive ${dc} notices it`;
}

function joinSubtitle(parts: ReadonlyArray<string | null | undefined>, fallback: string): string {
  const bits = parts.filter((part): part is string => !!part && part.length > 0);
  return bits.length ? bits.join(" · ") : fallback;
}

/**
 * Perception first — frame 11 reads "Undiscovered · Perception DC 16", and
 * the trap rows above already lead with the passive (Perception) DC. Shared
 * with `preparedMarks.ts`'s `featureSubtitle` so the map layer and the room
 * stack never disagree about which DC a feature leads with (#868 follow-up).
 */
export function featureDcPhrase(feature: Pick<DungeonFeature, "investigation_dc" | "perception_dc">): string | null {
  if (feature.perception_dc != null) return `Perception DC ${feature.perception_dc}`;
  if (feature.investigation_dc != null) return `Investigation DC ${feature.investigation_dc}`;
  return null;
}

/**
 * Every prompt this room's stack should show, in the frame's fixed order.
 * Deterministic for a given input — ties within a kind keep the input
 * array's own order, same convention `resolvePreparedMarks` sets.
 */
export function buildRoomStack(input: RoomStackInput): RoomStackRow[] {
  const { roomId } = input;
  const trapsById = new Map(input.traps.map((t) => [t.id, t]));
  const featuresById = new Map(input.features.map((f) => [f.id, f]));
  const rows: RoomStackRow[] = [];

  // ── What bites: traps placed in this room ──────────────────────────────
  for (const placement of input.placements) {
    if (placement.location_id !== roomId || placementKind(placement) !== "trap") continue;
    const trap = placement.trap_id ? trapsById.get(placement.trap_id) : undefined;
    if (!trap) continue;
    rows.push({
      id: `trap:${placement.id}`,
      kind: "trap",
      label: trap.name,
      // Frame 11 ("Passive 15 notices the seam · 7,2, third pew") names the
      // cell alongside the passive DC and the DM's own note — without it a
      // room with several traps reads as one undifferentiated pile.
      subtitle: joinSubtitle(
        [passivePhrase(trap.detection_dc), placement.source_cell_key ? `cell ${placement.source_cell_key}` : null, placement.note],
        "Trap",
      ),
      // There is no trap-firing mechanic in the app (traps are prep, not a
      // simulated mechanism) — Trigger is a reference link to the trap's own
      // page, the same place a DM would look up its save/damage to run it.
      action: "trigger",
      target: `/traps/${trap.id}`,
    });
  }

  // ── What fights: encounters placed here, plus any trigger zone over it ──
  const seenEncounterIds = new Set<string>();
  for (const encounter of input.encounters) {
    if (encounter.location_id !== roomId) continue;
    seenEncounterIds.add(encounter.id);
    rows.push({
      id: `encounter:${encounter.id}`,
      kind: "encounter",
      label: encounter.name,
      subtitle: encounter.combatants.length === 1 ? "1 combatant" : `${encounter.combatants.length} combatants`,
      action: "run",
      target: `/encounters/${encounter.id}/run`,
    });
  }

  const roomCells = new Set(input.roomRegion?.cells ?? []);
  if (roomCells.size > 0) {
    const encountersById = new Map(input.encounters.map((e) => [e.id, e]));
    for (const zone of input.zones) {
      if (zone.zone_kind !== "trigger") continue;
      const encounterId = zone.zone_payload.encounter_id;
      if (!encounterId || seenEncounterIds.has(encounterId)) continue;
      if (!zone.cells.some((cell) => roomCells.has(cell))) continue;
      const encounter = encountersById.get(encounterId);
      if (!encounter) continue;
      seenEncounterIds.add(encounterId);
      rows.push({
        id: `encounter-zone:${zone.id}`,
        kind: "encounter",
        label: encounter.name,
        subtitle: `Trigger zone on ${zone.label ?? "this room"} — prompt, never automatic`,
        action: "run",
        target: `/encounters/${encounter.id}/run`,
      });
    }
  }

  // ── What hides: this room's undiscovered secret ways out ────────────────
  for (const door of input.doors) {
    if (!door.is_secret || input.doorFound(door.id)) continue;
    const feature = door.dungeon_feature_id ? featuresById.get(door.dungeon_feature_id) : undefined;
    rows.push({
      id: `hidden:${door.id}`,
      kind: "hidden",
      label: feature?.name ?? door.label ?? "Secret way",
      subtitle: joinSubtitle(["Undiscovered", feature ? featureDcPhrase(feature) : null], "Undiscovered"),
      action: "reveal",
      target: door.id,
    });
  }

  // ── What to roll ─────────────────────────────────────────────────────────
  for (const placement of input.placements) {
    if (placement.location_id !== roomId || placementKind(placement) !== "roll_table") continue;
    if (!placement.roll_table) continue;
    rows.push({
      id: `roll:${placement.id}`,
      kind: "roll_table",
      label: placement.roll_table.name,
      subtitle: placement.note || "Roll for what's here",
      action: "roll",
      target: placement.roll_table.id,
    });
  }

  // ── What to hand over: held loot only — a dispatched entry is chat's
  //    story to tell now, not a thing to prompt on again here. ────────────
  for (const entry of input.loot) {
    if (entry.location_id !== roomId || entry.delivery_state !== "held") continue;
    rows.push({
      id: `loot:${entry.id}`,
      kind: "loot",
      label: entry.quantity > 1 ? `${entry.quantity}× ${entry.label}` : entry.label,
      subtitle: "Held until you drop it",
      action: "drop",
      target: entry.id,
    });
  }

  return rows;
}
