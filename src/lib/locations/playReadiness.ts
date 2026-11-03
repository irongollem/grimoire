// ── Ready for the table (#1125 decision 16, canvas frame 08) ─────────────────
//
// What the DM is told before Play: one row per thing the table will meet, a
// fix beside every row that has one. Nothing here stops the DM ("Nothing here
// stops you"), so a gap is amber and a missing optional thing is neutral.
// Pure derivation: `siteReadiness` already knows the grid and the unbound
// spaces, and this reuses it rather than counting them again.

import { frameCalibration } from "@/lib/locations/mapStack";
import { siteReadiness, type SiteReadinessInput } from "@/lib/locations/siteReadiness";
import { pluralizeCount } from "@/lib/utils";
import type { MapLive } from "@/types/mapLive.types";
import type { DarknessLevel } from "@/types/dungeonMap.types";
import type { SourceEdgeKey } from "@/types/locationDoor.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

export type ReadyStatus = "ok" | "gap" | "neutral";

/** What a fix does in the editor. The sheet maps each to a workbench move. */
export type ReadyFixAction =
  | { kind: "line-up" }
  | { kind: "place-door"; doorId: string }
  | { kind: "light" }
  | { kind: "link" };

export interface ReadyFix {
  label: string;
  action: ReadyFixAction;
  /** Which door a "Place it" is for, so two of them can be told apart. */
  subject?: string;
}

export interface ReadyRow {
  id: "grid" | "walls" | "doors" | "light" | "fog" | "rooms";
  label: string;
  detail: string;
  status: ReadyStatus;
  fixes: ReadyFix[];
}

export interface ReadyDoor {
  id: string;
  edge_key: SourceEdgeKey | null;
  to_location_id: string | null;
  from_location_id: string;
  from_name: string | null;
  to_name: string | null;
}

export interface PlayReadinessInput extends SiteReadinessInput {
  /** The published snapshot the battle map reads; null before the first publish. */
  live: MapLive | null;
  /** The Drawing's own light as the editor holds it right now. */
  darkness: DarknessLevel;
  hasDrawing: boolean;
  doors: readonly ReadyDoor[];
  regions: readonly LocationMapRegion[];
}

const DARKNESS_WORDS: Record<DarknessLevel, string> = {
  daylight: "Daylight",
  dim: "Dim",
  dark: "Dark",
};

function doorName(door: ReadyDoor): string {
  const from = door.from_name ?? "a room";
  return door.to_name ? `${from} to ${door.to_name}` : `${from} to the way out`;
}

export function playReadiness(input: PlayReadinessInput): ReadyRow[] {
  const readiness = siteReadiness(input);
  const { live, darkness, hasDrawing, doors, regions } = input;
  const cal = frameCalibration(input.location);

  const grid: ReadyRow = cal
    ? {
        id: "grid",
        label: "Grid",
        detail: `${Number(cal.cells_per_image_width.toFixed(1))} squares across`,
        status: "ok",
        fixes: [],
      }
    : {
        id: "grid",
        label: "Grid",
        detail: "No grid yet",
        status: "gap",
        fixes: [{ label: "Line up the grid", action: { kind: "line-up" } }],
      };

  const wallCount = live ? live.walls.length : 0;
  const walls: ReadyRow =
    wallCount > 0
      ? { id: "walls", label: "Walls", detail: "From the drawing; they block sight and light", status: "ok", fixes: [] }
      : {
          id: "walls",
          label: "Walls",
          detail:
            hasDrawing && !live
              ? "Read when the drawing is published"
              : "No walls yet: sight and light pass everywhere",
          status: "neutral",
          fixes: [],
        };

  const unplaced = doors.filter((d) => d.edge_key === null);
  const doorsRow: ReadyRow =
    doors.length === 0
      ? { id: "doors", label: "Doors", detail: "No doors yet", status: "neutral", fixes: [] }
      : {
          id: "doors",
          label: "Doors",
          detail:
            unplaced.length === 0
              ? pluralizeCount(doors.length, "door", "doors")
              : `${pluralizeCount(doors.length, "door", "doors")}. ${unplaced
                  .map((d) => `${doorName(d)} is in the list but not on the map`)
                  .join("; ")}.`,
          status: unplaced.length === 0 ? "ok" : "gap",
          fixes: unplaced.map((d) => ({
            label: "Place it",
            action: { kind: "place-door", doorId: d.id },
            subject: doorName(d),
          })),
        };

  const lightCount = live ? live.lights.length : 0;
  const light: ReadyRow = {
    id: "light",
    label: "Light",
    detail:
      lightCount > 0
        ? `${DARKNESS_WORDS[darkness]}, with ${pluralizeCount(lightCount, "light", "lights")} on the map`
        : `${DARKNESS_WORDS[darkness]}`,
    status: "ok",
    fixes: [{ label: "Change", action: { kind: "light" } }],
  };

  // Read-only today: it is how a fight seeds its fog, not a setting.
  const fog: ReadyRow = {
    id: "fog",
    label: "Fog at first",
    detail: "Hidden, except the room the fight starts in",
    status: "ok",
    fixes: [],
  };

  const unbound = regions.filter((r) => r.region_role === "space" && r.cells.length > 0 && r.space_location_id === null);
  const rooms: ReadyRow =
    readiness.unboundSpaces === 0
      ? { id: "rooms", label: "Rooms", detail: "Every traced space is a place in the Atlas", status: "ok", fixes: [] }
      : {
          id: "rooms",
          label: "Rooms",
          detail:
            readiness.unboundSpaces > 1
              ? `${readiness.unboundSpaces} traced spaces aren't places in the Atlas yet. Optional.`
              : `${unbound[0]?.label ?? "A traced space"} isn't a place in the Atlas yet. Optional.`,
          status: "neutral",
          fixes: [{ label: "Link", action: { kind: "link" } }],
        };

  return [grid, walls, doorsRow, light, fog, rooms];
}
