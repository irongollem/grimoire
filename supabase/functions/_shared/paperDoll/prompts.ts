/**
 * Every prompt the paper doll sends to the image model (#975). The wording was
 * tuned in a fidelity spike on the sunburst model: the cell layout, the "bare
 * head" rule and the likeness wording each fixed a specific failure, so change
 * the text only with a render to compare against.
 */
import type { DollTemplateSize } from "./types.ts";

/** The spike proved placement on this model; the generator pins it. */
export const DOLL_IMAGE_MODEL = "gpt-image-2.5-sunburst";
export const DOLL_SHEET_SIZE = "1536x1024";

// The sheet is cut in the empty gap between figures (sheetCuts in layout.ts), so
// the figures must not touch.
const GRID =
  "A character sprite sheet, 1536x1024, divided into exactly three equal vertical cells of 512x1024 each: left, centre, right. " +
  "Everything drawn in a cell stays inside it with an empty transparent margin of at least 40 px on its left and right: nothing crosses into a neighbouring cell. " +
  "No text, no labels, no cell borders or dividing lines. Fully transparent background: no floor, no cast shadow, no scenery. Painterly realistic fantasy illustration, even soft front lighting.";

// The head stays bare so the face always shows: headgear is a slot on the
// doll, not part of the outfit picture.
const FIGURE =
  "Each cell holds ONE full-length figure, head to toe, nothing cropped, centred horizontally in its cell, " +
  "the top of the head about 60 px below the top edge of the cell and the soles of the feet about 40 px above the bottom edge. " +
  "The figure faces the viewer in a neutral relaxed standing pose: feet hip-width apart, arms hanging slightly away from the body, empty open hands, no weapons, no props, no companions, no animals. " +
  "It is the SAME figure in all three cells: identical body, face, height, proportions, pose and placement; only the outfit changes. " +
  "Bare head: no hat, hood, helmet or headwear. No jewellery. No cloak or cape.";

const GARB =
  "Left cell: modest full-length plain undyed linen underclothes, a long-sleeved undershirt and ankle-length drawers covering the whole body, barefoot. " +
  "Centre cell: everyday adventurer's travelling clothes: tunic, trousers, belt and boots. " +
  "Right cell: a spellcaster's long robes, hood down, sandals.";

const ARMOUR =
  "Left cell: light armour, a fitted studded leather jerkin and leather bracers over clothes, boots. " +
  "Centre cell: medium armour, a chain shirt under a scale-mail coat, boots. " +
  "Right cell: heavy armour, full plate including armoured sabatons and gauntlets, no helmet so the face shows.";

const SIZE_BODY: Record<DollTemplateSize, string> = {
  medium: "The figure is an adult human of medium build, average height.",
  small:
    "The figure is an adult halfling, clearly a grown adult and not a child: about three feet tall with a sturdy build, shorter limbs and a proportionally larger head, drawn filling the cell height like any other figure.",
};

const SPECIES_DESCRIPTION_MAX = 600;

/** Text-only render: the template figure every other sheet is drawn from. */
export function templateGarbPrompt(size: DollTemplateSize): string {
  return `${GRID} ${FIGURE} ${SIZE_BODY[size]} ${GARB}`;
}

/** Image 1 is the portrait, image 2 the template garb sheet. */
export function characterGarbPrompt(): string {
  return (
    "Image 1 is a character portrait. Image 2 is a sprite-sheet template. Redraw the character from image 1 into the exact layout of image 2: the same three cells, the same pose, scale and placement of the figure in each cell, the same outfit kind in each cell. " +
    "Keep the character's likeness from image 1, not image 2's figure: face, skin, ears, hair, ancestry and build all come from image 1; image 2 supplies only layout, pose and outfit kind. " +
    "Invent the parts of the body the portrait does not show, consistent with it. Leave out image 1's scenery, weapons, props, headwear and any animals or companions. " +
    `Take colours, materials and trim from the character's own clothing in image 1. ${GRID} ${FIGURE} ${GARB}`
  );
}

/** Image 1 is the template garb sheet; there is no portrait, only the species. */
export function speciesGarbPrompt(species: { name: string; description: string | null; size: DollTemplateSize }): string {
  const description = species.description?.trim();
  const trimmed =
    description && description.length > SPECIES_DESCRIPTION_MAX
      ? `${description.slice(0, SPECIES_DESCRIPTION_MAX).trimEnd()}...`
      : description;
  return (
    `Image 1 is a sprite-sheet template. Redraw its figure as a typical adult ${species.name}, in the exact layout of image 1: the same three cells, the same pose, scale and placement of the figure in each cell, the same outfit kind in each cell. ` +
    `Keep image 1's layout, not its figure: face, skin, ears, hair, ancestry and build all come from the ${species.name} ancestry; image 1 supplies only layout, pose and outfit kind. ` +
    (trimmed ? `About the ${species.name}: ${trimmed} ` : "") +
    `${SIZE_BODY[species.size]} ` +
    "Invent colours, materials and trim suited to the species. Leave out headwear, jewellery, props, weapons, scenery and any animals or companions. " +
    `${GRID} ${FIGURE} ${GARB}`
  );
}

/**
 * Image 1 is the doll's own garb sheet. For a template there is no image 2;
 * for a character or species, image 2 is the template armour sheet, which
 * supplies the armour kinds.
 */
export function armourPrompt(opts: { withTemplate: boolean }): string {
  const sources = opts.withTemplate
    ? "Image 1 is a character sprite sheet. Image 2 is a template of three armour outfits. Draw the character of image 1, same face, body, pose and placement, wearing image 2's outfits in image 2's cells, in the character's own colours. "
    : "Image 1 is a sprite sheet of a figure in three outfits. Draw the SAME figure, same face, body, pose and placement in each cell, in new outfits. ";
  return `${sources}${GRID} ${FIGURE} ${ARMOUR}`;
}

/**
 * Image 1 is the doll's own garb sheet. These are standalone pictures for the
 * carry-weight figure, never laid over anything, so only the likeness and the
 * cell layout matter, not exact placement.
 */
export function burdenPrompt(): string {
  return (
    "Image 1 is a character sprite sheet. Draw the SAME character, same face and body, in the everyday clothes of image 1's centre cell, in three cells showing how heavily they are loaded. " +
    `${GRID} ` +
    "Each cell holds ONE full-length figure, head to toe, nothing cropped, centred horizontally in its cell, the soles of the feet about 40 px above the bottom edge. Bare head. No companions, no animals. " +
    "Left cell: carrying a full travelling pack with a bedroll strapped on top, still upright and walking easily. " +
    "Centre cell: heavily laden, leaning forward under an overstuffed pack hung with pots, sacks and a lantern, a bundle under one arm. " +
    "Right cell: staggering, knees buckling under an enormous teetering pile of packs, chests and bundles, about to topple; the pile is tall rather than wide, so it stays inside the cell."
  );
}
