import { glyph } from "@/lib/glyph";
import { TABLE_GLYPHS } from "@/lib/table/solo/tableGlyphs.generated";

// The AI table's three voice switches (#1021), traced from the maintainer's third sheet of 17 Nov 2026 (solid shapes, each with the same sound waves) (the /glyph
// skill; sources in .claude/skills/glyph/sources.md). Kept out of icons.ts: only the table screen draws them.
/** The narrator: an open book that sounds. */
export const IconVoiceNarrator = glyph(TABLE_GLYPHS.voiceNarrator);
/** The characters: someone in a brimmed hat, sounding. */
export const IconVoiceCharacters = glyph(TABLE_GLYPHS.voiceCharacters);
/** The player's own character: the hero's figure, sounding. */
export const IconVoicePlayer = glyph(TABLE_GLYPHS.voicePlayer);
