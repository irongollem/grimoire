// A battle-map/Mint token prefers the cutout — the figure alone on a
// transparent background — over the portrait/picture it sits beside
// (monsters.image_url, npcs.portrait_url). Drawn "contain" the whole figure
// fits inside the ring; a picture has to be drawn "cover" (cropped to the
// circle) because it was never composed to stand alone.
//
// Monster and NPC rows both name the field `cutout_url`, so one function
// reads it structurally off either without a cast.

export interface TokenArt {
  tokenUrl: string;
  tokenFit: "contain";
}

/** The cutout to draw as a token, or null when the entity has none — callers
 *  fall back to their own portrait/picture field (drawn "cover") in that case. */
export function resolveTokenArt(entity: { cutout_url: string | null }): TokenArt | null {
  if (!entity.cutout_url) return null;
  return { tokenUrl: entity.cutout_url, tokenFit: "contain" };
}
