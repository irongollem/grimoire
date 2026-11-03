/**
 * Category colour, in one place.
 *
 * Colour is load-bearing in the soundboard: a DM reads "music / ambient /
 * effects" off a card's spine before they read its name. That only
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
};

/** The card/pad spine — the thing that makes the category readable at a glance. */
export const CATEGORY_SPINE: Record<SoundCategory, string> = {
  music: "bg-sound-music",
  ambient: "bg-sound-ambient",
  effects: "bg-sound-effects",
};

/** Border for an active/playing surface. */
export const CATEGORY_BORDER: Record<SoundCategory, string> = {
  music: "border-sound-music",
  ambient: "border-sound-ambient",
  effects: "border-sound-effects",
};

/** Tinted fill for an active/playing surface. */
export const CATEGORY_TINT: Record<SoundCategory, string> = {
  music: "bg-sound-music/12",
  ambient: "bg-sound-ambient/12",
  effects: "bg-sound-effects/12",
};

/** Pill/chip styling for the category filter, so the filter speaks the same colour. */
export const CATEGORY_PILL: Record<SoundCategory, string> = {
  music: "bg-sound-music/15 border-sound-music/40 text-sound-music",
  ambient: "bg-sound-ambient/15 border-sound-ambient/40 text-sound-ambient",
  effects: "bg-sound-effects/15 border-sound-effects/40 text-sound-effects",
};

/**
 * Deck pad classes (the pad colours are fixed instruments, the same in every
 * theme; see `--pad-*` in theme.css and the Vellum vars). Written out in full
 * for Tailwind's scanner, like the maps above.
 */

/** A lit pad: instrument fill, dark ink, matching edge. */
export const PAD_LIT: Record<SoundCategory, string> = {
  music: "bg-pad-music text-pad-music-fg border-pad-music",
  ambient: "bg-pad-ambient text-pad-ambient-fg border-pad-ambient",
  effects: "bg-pad-effects text-pad-effects-fg border-pad-effects",
};

/** A pad at rest: a 10% tint and a 30% edge, so the colour is learnable before it lights. */
export const PAD_REST: Record<SoundCategory, string> = {
  music: "bg-pad-music/10 border-pad-music/30",
  ambient: "bg-pad-ambient/10 border-pad-ambient/30",
  effects: "bg-pad-effects/10 border-pad-effects/30",
};

/**
 * Icon colour at rest. The raw pad colours are 1.5-2.2:1 on Vellum's cream
 * card, so the icon is the pad colour mixed 55% toward the theme's foreground
 * (sRGB, so themes.vellum.test.ts can compute it): at least 3:1 on both Vellum
 * cards, and above 8:1 on Lamplight.
 */
export const PAD_ICON: Record<SoundCategory, string> = {
  music: "text-[color-mix(in_srgb,var(--pad-music)_55%,var(--foreground))]",
  ambient: "text-[color-mix(in_srgb,var(--pad-ambient)_55%,var(--foreground))]",
  effects: "text-[color-mix(in_srgb,var(--pad-effects)_55%,var(--foreground))]",
};

/** Soft glow around a lit pad. */
export const PAD_GLOW: Record<SoundCategory, string> = {
  music: "shadow-[0_0_1rem_color-mix(in_srgb,var(--pad-music)_55%,transparent)]",
  ambient: "shadow-[0_0_1rem_color-mix(in_srgb,var(--pad-ambient)_55%,transparent)]",
  effects: "shadow-[0_0_1rem_color-mix(in_srgb,var(--pad-effects)_55%,transparent)]",
};
