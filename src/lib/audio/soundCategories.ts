/**
 * Category colour, in one place.
 *
 * Colour is load-bearing in the soundboard: a DM reads "music / ambient /
 * effects / misc" off a card's spine before they read its name. That only
 * works if every surface agrees, so the mapping lives here rather than being
 * re-derived per component.
 *
 * Every class is written out in full because Tailwind's scanner has to see the
 * literal string — an interpolated `text-${hue}-400` compiles to nothing.
 */

import type { SoundCategory } from "@/types/sound.types";

// There is deliberately no CATEGORY_ACCENT. One lived here, mapping each
// category to a `VolumeSlider` accent, and never gained a consumer — a fader
// belongs to a bus, a layer or a master level, none of which has a category.
// Its existence was the stated reason `VolumeSlider` carried four accents; it
// went with them in #754. A fader takes the themed `primary`.

/** Text colour. */
export const CATEGORY_TEXT: Record<SoundCategory, string> = {
  music: "text-sound-music",
  ambient: "text-sound-ambient",
  effects: "text-sound-effects",
  misc: "text-sound-misc",
};

/** The card/pad spine — the thing that makes the category readable at a glance. */
export const CATEGORY_SPINE: Record<SoundCategory, string> = {
  music: "bg-sound-music",
  ambient: "bg-sound-ambient",
  effects: "bg-sound-effects",
  misc: "bg-sound-misc",
};

/** Border for an active/playing surface. */
export const CATEGORY_BORDER: Record<SoundCategory, string> = {
  music: "border-sound-music",
  ambient: "border-sound-ambient",
  effects: "border-sound-effects",
  misc: "border-sound-misc",
};

/** Tinted fill for an active/playing surface. */
export const CATEGORY_TINT: Record<SoundCategory, string> = {
  music: "bg-sound-music/12",
  ambient: "bg-sound-ambient/12",
  effects: "bg-sound-effects/12",
  misc: "bg-sound-misc/12",
};

/** Pill/chip styling for the category filter, so the filter speaks the same colour. */
export const CATEGORY_PILL: Record<SoundCategory, string> = {
  music: "bg-sound-music/15 border-sound-music/40 text-sound-music",
  ambient: "bg-sound-ambient/15 border-sound-ambient/40 text-sound-ambient",
  effects: "bg-sound-effects/15 border-sound-effects/40 text-sound-effects",
  misc: "bg-sound-misc/15 border-sound-misc/40 text-sound-misc",
};
