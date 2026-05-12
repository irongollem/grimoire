export interface StylePreset {
  id: string;
  label: string;
  description: string;
  promptSegment: string;
  icon: string;
}

export const CARTOGRAPHER_STYLE_PRESETS: StylePreset[] = [
  {
    id: "playable",
    label: "Playable",
    description: "Clean modern dungeon map — warm lighting, detailed dressing, fully readable",
    promptSegment:
      "modern illustrated dungeon map, warm candlelight color palette, clean readable encounter zones, detailed environmental dressing, fully spatially accurate, OneDnD 2024 Player's Handbook art style",
    icon: "🗺",
  },
  {
    id: "explorer",
    label: "Explorer's Sketch",
    description: "Hand-drawn on parchment — charming imperfections, as found in an adventurer's journal",
    promptSegment:
      "weathered field sketch on aged crinkled parchment, brown ink and pencil strokes, hand-written margin annotations, compass rose, cartographic imperfections as if drawn from memory mid-expedition",
    icon: "✏",
  },
  {
    id: "isometric",
    label: "Isometric",
    description: "3D axonometric perspective — may reinterpret the layout spatially",
    promptSegment:
      "isometric 3D dungeon cutaway, axonometric projection, painted stone walls and wooden floors, deep dramatic shadows, D&D 5e adventure module interior art style — may reinterpret room layout in 3D perspective",
    icon: "◈",
  },
  {
    id: "tactical",
    label: "Tactical Grid",
    description: "VTT-ready battle map — bold zone outlines, high-contrast surfaces",
    promptSegment:
      "tactical battle map, bold encounter zone outlines, numbered encounter areas, high-contrast surface textures, neutral gridded background, optimised for Foundry VTT and Roll20 display",
    icon: "⊞",
  },
  {
    id: "tome",
    label: "Ancient Tome",
    description: "Medieval illuminated manuscript — gilded borders, scriptorium ink",
    promptSegment:
      "medieval illuminated manuscript page, intricate decorative parchment border, gilded drop-cap details, scriptorium brown ink illustration with subtle gold leaf accents, monastic cartography style",
    icon: "✦",
  },
  {
    id: "woodcut",
    label: "Woodcut Print",
    description: "Bold 15th century woodcut — stark palette, cross-hatching shadows",
    promptSegment:
      "woodcut print on aged paper, bold black ink lines, cross-hatching for shadows and depth, stark limited ink palette, 15th century cartographic broadside style",
    icon: "▣",
  },
];

export const WATERMARK_SUFFIX =
  "small 'dungeongrimoire.com' text watermark in the bottom-right corner";
