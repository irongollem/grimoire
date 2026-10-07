import { glyph } from "@/lib/glyph";
import { DICE_GLYPHS } from "@/lib/dice/diceGlyphs.generated";
import { IconDice } from "@/lib/icons";

// Per-die glyphs for the dice roller grid and the quick-dice widget. They are
// here, not in icons.ts, so their ~50KB of path data loads with the two
// components that draw them instead of with the app. The d20 is the one glyph
// icons.ts keeps (as IconDice), so it is shared rather than stored twice.
export const IconDie2 = glyph(DICE_GLYPHS.d2);
export const IconDie4 = glyph(DICE_GLYPHS.d4);
export const IconDie6 = glyph(DICE_GLYPHS.d6);
export const IconDie8 = glyph(DICE_GLYPHS.d8);
export const IconDie10 = glyph(DICE_GLYPHS.d10);
export const IconDie12 = glyph(DICE_GLYPHS.d12);
export const IconDie20 = IconDice;
export const IconDie100 = glyph(DICE_GLYPHS.d100);
