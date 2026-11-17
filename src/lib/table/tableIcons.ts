import { glyph } from "@/lib/glyph";
import { TABLE_GLYPHS } from "@/lib/table/tableGlyphs.generated";

// The AI table's three voice switches (#1021), traced from the maintainer's second sheet of 17 Nov 2026 (the /glyph
// skill; sources in .claude/skills/glyph/sources.md). Kept out of icons.ts: only the table screen draws them.
/** The narrator: an open book that sounds. */
export const IconVoiceNarrator = glyph(TABLE_GLYPHS.voiceNarrator);
/** The characters: someone else's face in a speech balloon. */
export const IconVoiceCharacters = glyph(TABLE_GLYPHS.voiceCharacters);
/** The player's own character: the hero's figure, sounding. */
export const IconVoicePlayer = glyph(TABLE_GLYPHS.voicePlayer);
