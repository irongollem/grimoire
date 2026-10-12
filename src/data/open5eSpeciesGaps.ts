import type { SpeciesSize, SpeciesSpeed } from "@/types/species.types";

export interface SpeciesGap {
  size?: SpeciesSize;
  speed?: SpeciesSpeed;
  languages?: string[];
}

/**
 * Size, speed and fixed languages that Tome of Heroes states for a species or
 * subrace but Open5e's v2 record leaves out, keyed by Open5e record key. The
 * book's darakhul and gearforged say "Your size is determined by your Heritage
 * Subrace / Race Chassis", and each heritage and chassis then has its own Size,
 * Speed and Languages lines, which the Open5e conversion dropped along with the
 * malkin's Small size and the morel's 35 ft. Values are the book's, read from
 * Kobold Press's OGL text (kpogl.wikidot.com, race:ghoul-darakhul,
 * race:gearforged, race:mushroomfolk, race:catfolk).
 *
 * The import fills a field from here only where the record has none, so an
 * upstream fix wins. A language choice ("Elvish or Umbral", "one language of
 * your choice") is no fixed language and is left out, as `parseLanguages` does.
 *
 * `toh_shade` is the one deduction: the book defers its size and speed to the
 * race the shade was in life (its "Living Origin"), with no list to choose
 * from, so it takes the common case, Medium and 30 ft, and keeps the deferring
 * Size and Speed traits on the sheet for the DM to adjust.
 */
export const OPEN5E_SPECIES_GAPS: Readonly<Record<string, SpeciesGap>> = {
  // Shade: deduced, see above.
  toh_shade: { size: "medium", speed: { walk: 30 } },

  // Catfolk
  toh_malkin: { size: "small" },

  // Darakhul heritages
  "toh_derro-heritage": { size: "small", speed: { walk: 30 }, languages: ["Dwarvish"] },
  "toh_dragonborn-heritage": { size: "medium", speed: { walk: 25 }, languages: ["Draconic"] },
  "toh_drow-heritage": { size: "medium", speed: { walk: 30 }, languages: ["Elvish"] },
  "toh_dwarf-heritage": { size: "medium", speed: { walk: 25 }, languages: ["Dwarvish"] },
  "toh_elfshadow-fey-heritage": { size: "medium", speed: { walk: 30 } },
  "toh_gnome-heritage": { size: "small", speed: { walk: 25 }, languages: ["Gnomish"] },
  "toh_halfling-heritage": { size: "small", speed: { walk: 25 }, languages: ["Halfling"] },
  "toh_humanhalf-elf-heritage": { size: "medium", speed: { walk: 30 } },
  "toh_kobold-heritage": { size: "small", speed: { walk: 30 }, languages: ["Draconic"] },
  toh_ravenfolk: { size: "medium", speed: { walk: 30 }, languages: ["Huginn's Speech"] },
  "toh_tiefling-heritage": { size: "medium", speed: { walk: 30 }, languages: ["Infernal"] },
  "toh_trollkin-heritage": { size: "medium", speed: { walk: 30 }, languages: ["Trollkin"] },

  // Gearforged chassis
  "toh_dwarf-chassis": { size: "medium", speed: { walk: 25 }, languages: ["Dwarvish"] },
  "toh_gnome-chassis": { size: "small", speed: { walk: 25 }, languages: ["Gnomish"] },
  "toh_human-chassis": { size: "medium", speed: { walk: 30 } },
  "toh_kobold-chassis": { size: "small", speed: { walk: 30 }, languages: ["Draconic"] },

  // Mushroomfolk
  "toh_acid-cap": { size: "medium" },
  toh_favored: { size: "medium" },
  toh_morel: { size: "small", speed: { walk: 35 } },
};
