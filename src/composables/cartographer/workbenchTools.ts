// The Cartographer workbench's tool palette: every Drawing tool, the rail's families, Zoning's rail and
// the Room template's shapes. Static data, split out of MapWorkbench.vue (#1135).

import type { Component } from "vue";
import {
  IconSelect, IconBrush, IconWater, IconEraser, IconHand, IconWall, IconDoor, IconCube, IconRect, IconDrawLine,
  IconFill, IconWrapWalls, IconObjectStamp, IconAnnotate, IconEntityLink, IconRoomTemplate, IconCave, IconHighlight,
  IconAngledWall, IconLight, type AppIcon,
} from "@/lib/icons";
import type { RailFamily } from "@/components/cartographer/CartographerToolRail.vue";
import type { Tool } from "@/cartographer/tools";
import { PLAN_TOOLS, type PlanTool } from "@/composables/cartographer/usePlanPalette";
import type { TemplateShape } from "@/composables/cartographer/mapCanvasEditor.types";

export interface ToolDef {
  id: Tool;
  label: string;
  icon: Component;
  /** Single keyboard key that activates this tool (lowercase, plain key — no modifiers). */
  shortcut?: string;
  disabled?: boolean;
}
// The default tool on open: a DM's first tap must never paint. Select sits first in its
// family with Pan: both are "look, don't paint" tools that share the same drag-to-pan
// behaviour. Ids are the stored, keyed names; only the labels were reworded
// (the maintainer's pass of 17 Oct 2026: "Floor brush" and "Brush" were two brushes).
export const TOOLS: ToolDef[] = [
  // Letters follow Photoshop and Figma: V select, B brush, H hand. Escape still returns to Select.
  { id: "select",   label: "Select",        icon: IconSelect,       shortcut: "v" },
  { id: "pan",      label: "Pan",           icon: IconHand,         shortcut: "h" },
  { id: "brush",    label: "Brush",         icon: IconCave,         shortcut: "b" },
  { id: "floor",    label: "One tile",      icon: IconBrush,        shortcut: "i" },
  { id: "rect",     label: "Rectangle",     icon: IconRect,         shortcut: "r" },
  { id: "line",     label: "Line",          icon: IconDrawLine,     shortcut: "l" },
  { id: "template", label: "Room",          icon: IconRoomTemplate, shortcut: "m" },
  { id: "fill",     label: "Fill",          icon: IconFill,         shortcut: "f" },
  { id: "terrain",  label: "Water",         icon: IconWater,        shortcut: "a" },
  { id: "solid",    label: "Rock",          icon: IconCube,         shortcut: "s" },
  { id: "wall",     label: "Wall",          icon: IconWall,         shortcut: "w" },
  { id: "door",     label: "Door",          icon: IconDoor,         shortcut: "d" },
  { id: "wrap",     label: "Wrap",          icon: IconWrapWalls,    shortcut: "j" },
  { id: "angledWall", label: "Angled wall",  icon: IconAngledWall, shortcut: "n" },
  { id: "place",    label: "Place",         icon: IconObjectStamp,  shortcut: "o" },
  { id: "light",    label: "Light",         icon: IconLight,       shortcut: "u" },
  { id: "annotate", label: "Label",         icon: IconAnnotate,     shortcut: "t" },
  { id: "link",     label: "Link",          icon: IconEntityLink,   shortcut: "k" },
  { id: "eraser",   label: "Eraser",        icon: IconEraser,       shortcut: "e" },
];

// The rail's seven families (#1125 decision 3, canvas frame 07), the one place a tool is
// filed: the rail, the slip's grid and the family a key press lands in all read this.
// Adding a tool to a family is one id in its `tools` (plus its row in TOOLS above). The
// first tool is the family's default and gives the rail button its key.
export interface ToolFamilyDef {
  id: string;
  label: string;
  icon: Component;
  /** What the slip says under the family's name; the tile set is never named here (it is the rail's swatch). */
  caption?: string;
  tools: readonly Tool[];
  dividerBefore?: boolean;
}
export const TOOL_FAMILIES: readonly ToolFamilyDef[] = [
  { id: "select", label: "Select",  icon: IconSelect,      caption: "look, don't paint",           tools: ["select", "pan"] },
  { id: "draw",   label: "Draw",    icon: IconBrush,       caption: "floor",       tools: ["brush", "rect", "template", "line", "fill", "floor"] },
  { id: "walls",  label: "Walls",   icon: IconWall,        caption: "walls",         tools: ["wall", "door", "wrap", "angledWall"] },
  { id: "things", label: "Things",  icon: IconObjectStamp, caption: "objects, props and lights",           tools: ["place", "light"] },
  { id: "terrain", label: "Terrain", icon: IconWater,                                           tools: ["terrain", "solid"] },
  { id: "notes",  label: "Notes",   icon: IconAnnotate,    caption: "labels and links",    tools: ["annotate", "link"] },
  { id: "erase",  label: "Erase",   icon: IconEraser,      caption: "floor, walls and objects",    tools: ["eraser"], dividerBefore: true },
];
function toolDef(id: Tool): ToolDef {
  const found = TOOLS.find((t) => t.id === id);
  if (!found) throw new Error(`Tool "${id}" is filed in a family but has no TOOLS row`);
  return found;
}
export const RAIL_FAMILIES: RailFamily[] = TOOL_FAMILIES.map((f) => ({
  id: f.id,
  label: f.label,
  icon: f.icon,
  tools: f.tools.map(toolDef),
  dividerBefore: f.dividerBefore,
}));

// Zoning's tools get the same rail, each a family of one with its key in the corner.
const PLAN_TOOL_ICONS: Record<PlanTool, AppIcon> = {
  zone: IconHighlight,
  door: IconDoor,
  fill: IconFill,
  erase: IconEraser,
};
export const PLAN_RAIL_FAMILIES: RailFamily[] = PLAN_TOOLS.map((t) => ({
  id: t.id,
  label: t.label,
  icon: PLAN_TOOL_ICONS[t.id],
  tools: [{ id: t.id, label: t.label, icon: PLAN_TOOL_ICONS[t.id], shortcut: t.shortcut }],
  dividerBefore: t.id === "erase",
}));

export const TEMPLATE_SHAPES: { id: TemplateShape; label: string; icon: string }[] = [
  { id: "circle",  label: "Circle",   icon: "○" },
  { id: "octagon", label: "Octagon",  icon: "⬡" },
  { id: "hex",     label: "Hex",      icon: "⬢" },
];

// Tools Alt inverts into an erase mirror — see useMapCanvasEditor.ts's
// toolPointerDown/Move/Up. Select/Pan/Fill/Wrap/Annotate/Link/Eraser/Space
// have nothing to invert, so they're deliberately absent here.
export const INVERTIBLE_TOOLS = new Set<Tool>([
  "floor", "terrain", "brush", "solid", "wall", "place", "door", "rect", "line", "template",
]);
