import type { LocationType } from "@/types/location.types";

/**
 * LocationPreset — matches SettingLocationDef from src/settings/types.ts.
 * Kept here for backward compatibility with composables that import this type.
 */
export interface LocationPreset {
  name: string;
  location_type: LocationType;
  notes: string | null;
  tags: string[];
  /** Name of another preset in the same bundle that is this location's parent. */
  parent?: string;
}

/**
 * Setting-agnostic planar locations — the D&D multiverse planes that any
 * campaign may visit regardless of its home setting.
 */
export const PLANAR_LOCATIONS: LocationPreset[] = [
  // Transitive planes
  { name: "The Astral Plane",   location_type: "plane", notes: "A silvery void connecting all planes of existence. Home to githyanki silver cities and the drifting god-isles of long-dead deities.", tags: ["transitive", "astral", "githyanki"] },
  { name: "The Ethereal Plane", location_type: "plane", notes: "A misty borderland coexisting with the Material Plane, used by ghosts and travelers passing between inner and outer planes.", tags: ["transitive", "ethereal", "ghosts"] },
  { name: "The Feywild",        location_type: "plane", notes: "The Plane of Faerie — a mirror of the Material Plane suffused with wild magic, beauty, and danger. Home to the Seelie and Unseelie Courts.", tags: ["feywild", "fey", "archfey", "seelie", "unseelie"] },
  { name: "The Shadowfell",     location_type: "plane", notes: "The Plane of Shadow — a dark reflection of the Material Plane where all colour drains to grey. Home to the Shadar-kai and the Raven Queen.", tags: ["shadowfell", "shadow", "raven queen", "shadar-kai"] },
  // Inner planes
  { name: "Elemental Plane of Fire",  location_type: "plane", notes: "A plane of endless conflagration, home to the City of Brass and the efreeti sultans.", tags: ["inner planes", "fire", "efreeti", "city of brass"] },
  { name: "Elemental Plane of Water", location_type: "plane", notes: "A boundless ocean with no surface, home to marids and the coral cities of the Elemental Court of Water.", tags: ["inner planes", "water", "marids"] },
  { name: "Elemental Plane of Earth", location_type: "plane", notes: "An infinite mass of rock and crystal tunnels. Home to dao, xorn, and vast underground kingdoms.", tags: ["inner planes", "earth", "dao"] },
  { name: "Elemental Plane of Air",   location_type: "plane", notes: "A limitless sky with no ground, home to djinn, aarakocra, and the floating cities of the djinn sultans.", tags: ["inner planes", "air", "djinn", "aarakocra"] },
  // Outer planes — upper
  { name: "Mount Celestia",  location_type: "plane", notes: "The Seven Heavens — a shining plane of absolute law and good, home to archons and the souls of the most virtuous.", tags: ["upper planes", "lawful good", "archons"] },
  { name: "Arborea",         location_type: "plane", notes: "The Olympian Glades — a chaotic good plane of wild beauty and passion. Home to elven gods and their divine servants.", tags: ["upper planes", "chaotic good", "elves"] },
  { name: "Elysium",         location_type: "plane", notes: "A neutral good plane of perfect peace and rest. Home of departed good souls and the birthplace of guardinals.", tags: ["upper planes", "neutral good", "guardinals"] },
  { name: "Ysgard",          location_type: "plane", notes: "The Heroic Domains — a plane of eternal battle and glory, home to Norse-inspired gods, giants, and the honored slain.", tags: ["upper planes", "chaotic good", "giants", "norse"] },
  // Outer planes — lower
  { name: "The Nine Hells",  location_type: "plane", notes: "Baator — nine layers of lawful evil dominated by archdevils. Avernus down through Nessus (Asmodeus).", tags: ["lower planes", "lawful evil", "devils", "asmodeus"] },
  { name: "Avernus",         location_type: "plane", parent: "The Nine Hells", notes: "The first layer of the Nine Hells, ruled by Zariel — a blasted hellscape of endless war between demons and devils.", tags: ["nine hells", "zariel", "devils", "war"] },
  { name: "The Abyss",       location_type: "plane", notes: "An infinite layered plane of pure chaos and evil, home to the tanar'ri demons.", tags: ["lower planes", "chaotic evil", "demons", "tanar'ri"] },
  { name: "Gehenna",         location_type: "plane", notes: "The Bleak Eternity — volcanic mountainsides where yugoloths sell their services to both sides of the Blood War.", tags: ["lower planes", "neutral evil", "yugoloths"] },
  { name: "Hades",           location_type: "plane", notes: "The Gray Waste — three bleak grey layers where all emotion drains away. Home to larvae.", tags: ["lower planes", "neutral evil", "gray waste"] },
  // Outer planes — neutral
  { name: "Mechanus",        location_type: "plane", notes: "Infinite interlocking clockwork gears — a plane of absolute law and order, ruled by modrons and the god Primus.", tags: ["outer planes", "lawful neutral", "modrons", "clockwork"] },
  { name: "Limbo",           location_type: "plane", notes: "The Ever-Changing Chaos — a roiling soup of unformed matter shaped by willpower alone.", tags: ["outer planes", "chaotic neutral", "slaadi", "githzerai"] },
  // Special
  { name: "Sigil",           location_type: "city",  notes: "The City of Doors — a planar metropolis atop the Spire, accessible from any plane via portals. Governed by the Lady of Pain.", tags: ["outlands", "lady of pain", "portals", "planar hub"] },
];

/**
 * Preset locations keyed by setting ID.
 * Source of truth: src/settings/*.ts — this is a re-export for backward compatibility.
 */
export { SETTING_LOCATIONS } from "@/settings/index";
