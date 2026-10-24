import type { WorkbenchDish, WorkbenchSprite } from "@/data/workbenchArt";

/** A box in percent of the dish box: left and width of its width, top and height of its height. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SlotGeometry {
  /** Dish height over width, for the box's aspect-ratio. */
  aspect: number;
  sprite: Box;
  /** The contact line: a blacked-out copy of the sprite behind it, nudged down by `dropPct` of the sprite box's
   *  own height (a CSS translateY percentage) and blurred by `blurOfSpriteWidth` x the sprite's rendered width. */
  contact: { dropPct: number; blurOfSpriteWidth: number; opacity: number };
  /** `mask-image` that shows only the dish's front lip (page sets `mask-composite: intersect`). */
  rimMask: string;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Grounding is a contact line only (the maintainer's pick, 24 Oct 2026): the sprite's own silhouette, darkened,
 * nudged a few percent down and blurred, behind the sprite, so a sliver shows along its real bottom edge. An
 * ellipse under the object, a halo round it, or a cast shadow all read as the object hovering over a shadow.
 * Fractions of the sprite's width; `art-955/workbench/cut.py` draws its review sheets with the same numbers.
 */
export const CONTACT_SHADOW = { opacity: 0.85, drop: 0.03, blur: 0.01 } as const;

/** The dish's own contact line: its silhouette dropped by 3% of its width, as a share of its own height. */
export function dishContactDropPct(dish: WorkbenchDish): number {
  return round(((CONTACT_SHADOW.drop * dish.width) / dish.height) * 100);
}

/**
 * Where a material stands in its dish. Everything is a percentage of the dish
 * box so the dish can be sized in rem and the sprite follows. The sprite's
 * lowest opaque row lands on the floor line inside the opening, and the
 * occluding rim is the picture of the dish itself, masked to its front lip.
 */
export function slotGeometry(dish: WorkbenchDish, sprite: WorkbenchSprite, scale = 0.44): SlotGeometry {
  const o = dish.opening;
  const dw = 100;
  const dh = (dw * dish.height) / dish.width;

  const sw = scale * dw;
  const sh = (sw * sprite.height) / sprite.width;
  const floorY = (o.cy + o.ry * o.floor) * dh;
  const top = floorY - sprite.base * sh;
  const left = o.cx * dw - sw / 2;

  const pct = (x: number, y: number, w: number, h: number): Box => ({
    left: round((x / dw) * 100),
    top: round((y / dh) * 100),
    width: round((w / dw) * 100),
    height: round((h / dh) * 100),
  });

  const cy = round(o.cy * 100);

  return {
    aspect: round(dh / dw),
    sprite: pct(left, top, sw, sh),
    contact: {
      dropPct: round(((CONTACT_SHADOW.drop * sw) / sh) * 100),
      blurOfSpriteWidth: CONTACT_SHADOW.blur,
      opacity: CONTACT_SHADOW.opacity,
    },
    rimMask:
      `radial-gradient(ellipse ${round(o.rx * 100)}% ${round(o.ry * 100)}% at ${round(o.cx * 100)}% ${cy}%, transparent 98%, #000 100%), ` +
      `linear-gradient(to bottom, transparent ${cy}%, #000 ${cy}%)`,
  };
}
