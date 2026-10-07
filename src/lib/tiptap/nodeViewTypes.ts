// Types shared between the tiptap node extensions in this folder and the Vue
// node views / chips under src/components that render them. They live apart so
// a component never imports its own extension (the extension imports the
// component to render it), which would make a runtime import cycle.

export type EntityType = "player" | "npc" | "monster" | "location" | "party" | "faction";

export type EntityEmbedType = "npc" | "monster" | "spell" | "item" | "location" | "quest";

/**
 * Stat-block size (#915 story 6). "auto" is the default and picks itself from
 * the entity's own content (see estimateStatBlockSize() in scriptoriumImport.ts) —
 * a short stat block reads as a "column" box in its own text column, a long
 * one as a "wide" block spanning both page columns with its own internal
 * two-column flow, matching how the printed books lay out a creature too
 * long for one column. The author can override either way.
 */
export type EntityEmbedSize = "auto" | "column" | "wide";

/** The suggestion chip a DM clicked to generate from. The chip marks where the
 *  Chronicler meant the picture to go, so the image it starts takes the chip's
 *  place rather than landing at the cursor. */
export interface IllustrationTarget {
  pos: number;
  prompt: string;
}

export interface IllustrationSuggestionOptions {
  onPromptClick?: (target: IllustrationTarget) => void;
}
