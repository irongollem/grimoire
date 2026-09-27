export interface StylePreset {
  id: string;
  label: string;
  description: string;
  icon: string;
}

export const CARTOGRAPHER_STYLE_PRESETS: StylePreset[] = [
  {
    id: "playable",
    label: "Playable",
    description: "Clean modern dungeon map with warm lighting and detailed dressing, fully readable",
    icon: "🗺",
  },
  {
    id: "explorer",
    label: "Explorer's Sketch",
    description: "Hand-drawn on parchment, with the charming imperfections of an adventurer's journal",
    icon: "✏",
  },
  {
    id: "isometric",
    label: "Isometric",
    description: "3D axonometric perspective. May reinterpret the layout spatially",
    icon: "◈",
  },
  {
    id: "tactical",
    label: "Tactical Grid",
    description: "VTT-ready battle map: bold zone outlines, high-contrast surfaces",
    icon: "⊞",
  },
  {
    id: "tome",
    label: "Ancient Tome",
    description: "Medieval illuminated manuscript: gilded borders, scriptorium ink",
    icon: "✦",
  },
  {
    id: "woodcut",
    label: "Woodcut Print",
    description: "Bold 15th century woodcut: stark palette, cross-hatching shadows",
    icon: "▣",
  },
];

export const WATERMARK_SUFFIX =
  "small 'dungeongrimoire.com' text watermark in the bottom-right corner";
