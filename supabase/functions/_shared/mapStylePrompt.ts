// The AI map styler's prompt (`style-map`). Lives here rather than in the
// function so vitest can hold it: the prompt is what decides whether a render
// keeps the DM's layout, and no gate sees a regression in it otherwise.

const WATERMARK = "a small 'dungeongrimoire.com' text watermark in the bottom-right corner";

/**
 * Said first, because the model weighs the start of a prompt most. The
 * isometric preset opts out: re-projecting the layout is what it is for.
 */
const KEEP_LAYOUT =
  "Repaint this top-down map image in the style below without changing its layout: every wall, door, stair and room outline stays exactly where the input image draws it, at the same size and position. Do not add rooms, walls, corridors or buildings the input does not have, and do not add a title, banner or cartouche. The small white words on the input are notes saying what belongs where: paint those things, and do not write the words.";

/**
 * The walls are the DM's and stay put; the furniture is a sketch of intent.
 * Drawn from a tile palette, it comes in a few fixed facings and identical
 * copies, and the model painted both literally: chairs turned away from the
 * table they stood at, and two crates of pots side by side kept as two
 * copies of one crate instead of one wider stack (the maintainer, styling
 * the demo's inn, 8 Nov 2026). Each piece keeps its place, since tokens
 * stand on that grid, but how it faces and how repeats read is the model's
 * call.
 */
const INTERPRET_PROPS =
  "The furniture and props in the input are a sketch of what stands where, drawn from a small set of stamps: keep each thing in its place, but paint it the way a real room would have it. Turn chairs and stools to face the table or counter they belong to, merge identical pieces standing side by side into one larger natural group rather than repeating the same piece, and vary repeated items so no two look copied.";

/**
 * Every preset, the isometric one included. The app lays its own grid over a styled map at play, so a grid painted into the
 * picture competes with it: two sets of lines that never quite agree. Models add one unasked, because "battle map" is mostly
 * gridded pictures, and they repaint any cell lines they can see in the input (the old tile floors drew a square per cell).
 * Seen on a styled Sugarwell map, 15 Oct 2026, where lines ran even through the plain black padding around the building.
 */
const NO_GRID =
  "Do not draw a grid, cell lines, squares or any measuring marks anywhere in the picture, and do not paint floors as square tiles that line up into a grid; the app overlays its own grid.";

// Style words only, never a publisher's product or house art: asking the model
// to imitate a named book is asking it to reproduce someone's trade dress.
export const PRESET_PROMPTS: Record<string, string> = {
  playable:
    "modern illustrated dungeon map, warm candlelight color palette, clean readable encounter zones, detailed environmental dressing, contemporary painted fantasy tabletop illustration",
  explorer:
    "weathered field sketch on aged crinkled parchment, brown ink and pencil strokes, hand-written margin annotations, compass rose, cartographic imperfections as if drawn from memory mid-expedition",
  isometric:
    "isometric 3D dungeon cutaway, axonometric projection, painted stone walls and wooden floors, deep dramatic shadows, painted fantasy adventure interior illustration, may reinterpret room layout in 3D perspective",
  tactical:
    "tactical battle map, bold encounter zone outlines, numbered encounter areas, high-contrast surface textures, plain neutral background, optimised for Foundry VTT and Roll20 display",
  tome:
    "medieval illuminated manuscript page, intricate decorative parchment border, gilded drop-cap details, scriptorium brown ink illustration with subtle gold leaf accents, monastic cartography style",
  woodcut:
    "woodcut print on aged paper, bold black ink lines, cross-hatching for shadows and depth, stark limited ink palette, 15th century cartographic broadside style",
};

export function buildMapStylePrompt(
  presetId: string,
  mapName: string,
  mapDescription: string | null | undefined,
  suffix: string | null | undefined,
): string {
  const preset = PRESET_PROMPTS[presetId] ? presetId : "playable";
  const parts: string[] = [];
  if (preset !== "isometric") parts.push(KEEP_LAYOUT, INTERPRET_PROPS);
  // Named as the subject, not left as a bare phrase: on its own the name read
  // as lettering to paint, and came back as a title banner.
  if (mapName.trim()) parts.push(`The place: ${mapName.trim()}.`);
  if (mapDescription?.trim()) parts.push(mapDescription.trim());
  parts.push(`Style: ${PRESET_PROMPTS[preset]}.`);
  parts.push(NO_GRID);
  if (suffix?.trim()) parts.push(suffix.trim());
  parts.push(`Add ${WATERMARK}.`);
  return parts.join(" ");
}
