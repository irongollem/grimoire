import { glyph } from "@/lib/glyph";
import { CRAFTING_GLYPHS } from "@/lib/crafting/craftingGlyphs.generated";

// Hand-drawn, vectorized icons for the Workshop's crafting disciplines, in the
// same style as the nav glyphs. Source art is in the local art-src/ dump;
// the pipeline is scripts/glyphs (the /glyph skill).
// Wired into src/lib/crafting-disciplines.ts. Kept out of icons.ts so the
// ~75KB of path data loads with the Workshop rather than with the app.
export const IconCraftAlchemy = glyph(CRAFTING_GLYPHS.alchemy);
export const IconCraftSmithing = glyph(CRAFTING_GLYPHS.smithing);
export const IconCraftLeathercraft = glyph(CRAFTING_GLYPHS.leathercraft);
export const IconCraftWoodcraft = glyph(CRAFTING_GLYPHS.woodcraft);
export const IconCraftJewelcrafting = glyph(CRAFTING_GLYPHS.jewelcrafting);
export const IconCraftHerbalism = glyph(CRAFTING_GLYPHS.herbalism);
export const IconCraftPoisoncraft = glyph(CRAFTING_GLYPHS.poisoncraft);
export const IconCraftTinkering = glyph(CRAFTING_GLYPHS.tinkering);
export const IconCraftCooking = glyph(CRAFTING_GLYPHS.cooking);
export const IconCraftScribing = glyph(CRAFTING_GLYPHS.scribing);
export const IconCraftBrewing = glyph(CRAFTING_GLYPHS.brewing);
export const IconCraftWeaving = glyph(CRAFTING_GLYPHS.weaving);
export const IconCraftMasonry = glyph(CRAFTING_GLYPHS.masonry);
export const IconCraftPainting = glyph(CRAFTING_GLYPHS.painting);
