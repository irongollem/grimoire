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
  music: "text-gold-400",
  ambient: "text-green-400",
  effects: "text-blue-500",
  misc: "text-arcane-purple-light",
};

/** The card/pad spine — the thing that makes the category readable at a glance. */
export const CATEGORY_SPINE: Record<SoundCategory, string> = {
  music: "bg-gold-400",
  ambient: "bg-green-400",
  effects: "bg-blue-500",
  misc: "bg-arcane-purple-light",
};

/** Border for an active/playing surface. */
export const CATEGORY_BORDER: Record<SoundCategory, string> = {
  music: "border-gold-400",
  ambient: "border-green-400",
  effects: "border-blue-500",
  misc: "border-arcane-purple-light",
};

/** Tinted fill for an active/playing surface. */
export const CATEGORY_TINT: Record<SoundCategory, string> = {
  music: "bg-gold-400/12",
  ambient: "bg-green-400/12",
  effects: "bg-blue-500/12",
  misc: "bg-arcane-purple-light/12",
};

/** Pill/chip styling for the category filter, so the filter speaks the same colour. */
export const CATEGORY_PILL: Record<SoundCategory, string> = {
  music: "bg-gold-400/15 border-gold-400/40 text-gold-300",
  ambient: "bg-green-400/15 border-green-400/40 text-green-300",
  effects: "bg-blue-500/15 border-blue-500/40 text-blue-300",
  misc: "bg-arcane-purple-light/15 border-arcane-purple-light/40 text-arcane-purple-light",
};
