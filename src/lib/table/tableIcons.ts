import { glyph } from "@/lib/glyph";
import { TABLE_GLYPHS } from "@/lib/table/tableGlyphs.generated";

// The AI table's three voice switches (#1021), traced from the maintainer's sheet of 17 Nov 2026 (the /glyph
// skill; sources in .claude/skills/glyph/sources.md). Kept out of icons.ts: only the table screen draws them.
/** The narrator: an open book that sounds. */
export const IconVoiceNarrator = glyph(TABLE_GLYPHS.voiceNarrator);
/** The characters: two masks facing each other. Twice as wide as it is tall; see `VOICE_CHARACTERS_BOX`. */
export const IconVoiceCharacters = glyph(TABLE_GLYPHS.voiceCharacters);
/** The player's own character: one figure with a speech balloon. */
export const IconVoicePlayer = glyph(TABLE_GLYPHS.voicePlayer);

/**
 * The band of its square the two masks fill. Drawn in the square a glyph normally gets, each mask is a few pixels
 * tall; given this as its `viewBox` and a box twice as wide as high, they are the height of their neighbours.
 */
export const VOICE_CHARACTERS_BOX = "4 29 92 41";
