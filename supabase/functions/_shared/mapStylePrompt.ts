// The AI map styler's prompt (`style-map`). Lives here rather than in the
// function so vitest can hold it: the prompt is what decides whether a render
// keeps the DM's layout, and no gate sees a regression in it otherwise.

/**
 * The OpenAI model the styler renders with, whatever the platform default is.
 * The rest of the platform runs `gpt-image-2.5-flare` for speed; a restyle
 * has to keep the drawn walls where they are, and flare treated the input as
 * a loose sketch (27 Sep 2026: bigger buildings, invented rooms, a title
 * banner). Neither 2.5 model accepts `input_fidelity`, so the stronger model
 * and the prompt below are the levers there are.
 */
export const MAP_STYLE_OPENAI_MODEL = "gpt-image-2.5-sunburst";

const WATERMARK = "a small 'dungeongrimoire.com' text watermark in the bottom-right corner";

/**
 * Said first, because the model weighs the start of a prompt most. The
 * isometric preset opts out: re-projecting the layout is what it is for.
 */
const KEEP_LAYOUT =
  "Repaint this top-down map image in the style below without changing its layout: every wall, door, stair and room outline stays exactly where the input image draws it, at the same size and position. Do not add rooms, walls, corridors or buildings the input does not have, and do not add a title, banner or cartouche. The small white words on the input are notes saying what belongs where: paint those things, and do not write the words.";

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
    "tactical battle map, bold encounter zone outlines, numbered encounter areas, high-contrast surface textures, neutral gridded background, optimised for Foundry VTT and Roll20 display",
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
  if (preset !== "isometric") parts.push(KEEP_LAYOUT);
  // Named as the subject, not left as a bare phrase: on its own the name read
  // as lettering to paint, and came back as a title banner.
  if (mapName.trim()) parts.push(`The place: ${mapName.trim()}.`);
  if (mapDescription?.trim()) parts.push(mapDescription.trim());
  parts.push(`Style: ${PRESET_PROMPTS[preset]}.`);
  if (suffix?.trim()) parts.push(suffix.trim());
  parts.push(`Add ${WATERMARK}.`);
  return parts.join(" ");
}
