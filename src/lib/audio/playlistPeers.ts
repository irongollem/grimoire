/**
 * The two playlist peers, named for humans.
 *
 * Scenes and music playlists share a table, a card and an editor, and differ
 * only in the question a DM is asking — a scene is a *room*, a playlist is a
 * *running order*. Every surface that talks about one of them pulls its words
 * from here, because the first time a tab says "Scene" and the dialog behind
 * it says "Playlist", the rename has failed.
 */

import { IconListOrdered, IconWind } from "@/lib/icons";
import type { PlaylistType } from "@/types/sound.types";

export interface PlaylistNoun {
  singular: string;
  plural: string;
  icon: typeof IconWind;
  /** Empty-state explanation of what this peer is for. */
  blurb: string;
  /** What the ordered entries inside one are called. */
  entriesLabel: string;
}

export const PLAYLIST_NOUNS: Record<PlaylistType, PlaylistNoun> = {
  ambient: {
    singular: "Scene",
    plural: "Scenes",
    icon: IconWind,
    blurb:
      "A scene layers sounds into a room — a bed underneath, and one-shots firing on their own schedule so it never sounds like a loop.",
    entriesLabel: "Layers",
  },
  music: {
    singular: "Playlist",
    plural: "Playlists",
    icon: IconListOrdered,
    blurb: "A playlist chains tracks in order, with shuffle and repeat. One plays at a time.",
    entriesLabel: "Tracks",
  },
};
