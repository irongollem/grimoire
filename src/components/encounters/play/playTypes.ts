/** The seven tools of the Play toolbelt (#1125 frame 11). Doors toggle and tokens move under every one of them. */
export type PlayTool = "move" | "measure" | "area" | "fog" | "darkness" | "ping" | "draw";
/** The tools the explore screen's map has: no Area, Fog or Darkness, because fog is by room when exploring. */
export type ExploreTool = Extract<PlayTool, "move" | "measure" | "ping" | "draw">;
/** What a fog click does: reveal the whole traced room under it, brush cells revealed, or brush them hidden again. */
export type FogBrushKind = "room" | "reveal" | "hide";
export type BrushShape = "round" | "cell";
export type BrushSize = 1 | 3 | 5;
/** Radii of a sphere of magical darkness in feet; 15 is the darkness spell. */
export type DarknessRadius = 10 | 15 | 20 | 30;
/** "dm" draws the DM's own screen with tools; "follower" is the second window, which only reads the live row. */
export type PlayMapMode = "dm" | "follower";

/** What the View menu toggles; the map reads it, the bar writes it. */
export interface PlayViewState {
  showTokens: boolean;
  showZones: boolean;
  showFog: boolean;
  showGrid: boolean;
  /** Draw the map as a player sees it: fog opaque, hidden and unseen combatants dropped. */
  asPlayer: boolean;
  /** Pan the map to whoever's turn it is when the turn changes. */
  followTurn: boolean;
  /** The key to the map's colours and zones, in the map's corner. */
  showLegend: boolean;
}

export const DEFAULT_PLAY_VIEW: PlayViewState = {
  showTokens: true,
  showZones: true,
  // Off in the DM's own view (frame 13); the fog brushes still edit the mask regardless.
  showFog: false,
  showGrid: true,
  asPlayer: false,
  followTurn: false,
  showLegend: false,
};

/** The key that arms each tool; PlayMap binds them and PlayToolbelt prints them. */
export const PLAY_TOOL_KEYS: Record<PlayTool, string> = {
  move: "v",
  measure: "m",
  area: "t",
  fog: "f",
  darkness: "k",
  ping: "p",
  draw: "d",
};

/** Sphere, Cone, Line, Cube: the Area tool's shapes, as the book lists them. */
export type { AreaShape } from "@/lib/battlemap/areaTemplates";

/** dataTransfer type a tray portrait carries (the combatant's instance id) onto the map. */
export const PLAY_DRAG_TYPE = "application/x-grimoire-combatant";
