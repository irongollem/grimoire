import type { Component } from "vue";
import { IconLayers, IconLightning, IconListOrdered, IconMusicNote, IconWind } from "@/lib/icons";
import type { SoundCategory } from "@/types/sound.types";

/**
 * The five things a library item or a pad can be, in one place.
 *
 * Colour says the category (music, ambience, effect), but a music track and a
 * playlist share the music colour and an ambience track and a scene share the
 * ambience one, so colour alone cannot tell a DM which of the four they are
 * holding (the maintainer, 7 Nov 2026). The icon and the word do, and every
 * surface takes them from here so the library, the pads and the editors agree.
 */
export type SoundKind = "music" | "playlist" | "ambience" | "scene" | "effect";

/** A single sound's kind, from its category. */
export const KIND_OF_CATEGORY: Record<SoundCategory, SoundKind> = {
  music: "music",
  ambient: "ambience",
  effects: "effect",
};

export function soundKindOf(kind: "sound" | "scene" | "playlist", category: SoundCategory | null): SoundKind {
  if (kind === "scene") return "scene";
  if (kind === "playlist") return "playlist";
  return KIND_OF_CATEGORY[category ?? "effects"];
}

export const SOUND_KIND_LABEL: Record<SoundKind, string> = {
  music: "Music track",
  playlist: "Playlist",
  ambience: "Ambience track",
  scene: "Scene",
  effect: "Effect",
};

export const SOUND_KIND_ICON: Record<SoundKind, Component> = {
  music: IconMusicNote,
  playlist: IconListOrdered,
  ambience: IconWind,
  scene: IconLayers,
  effect: IconLightning,
};

/** The choice a single sound offers: which of the three single kinds it is. */
export const SOUND_KIND_OPTIONS: { value: SoundCategory; label: string }[] = [
  { value: "music", label: "Music track" },
  { value: "ambient", label: "Ambience track" },
  { value: "effects", label: "Effect" },
];

export const SOUND_KIND_HINT: Record<SoundCategory, string> = {
  music: "Rides the Music fader, and loops on a pad by default.",
  ambient: "Rides the Ambience fader, and loops on a pad by default.",
  effects: "Rides the Effects fader, and plays once per press on a pad by default.",
};
