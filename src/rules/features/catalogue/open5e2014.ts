import type { FeatureCatalogue } from "./types";
import { BARBARIAN_FEATURES } from "./open5e2014/barbarian";
import { BARD_FEATURES } from "./open5e2014/bard";
import { CLERIC_FEATURES } from "./open5e2014/cleric";
import { DRUID_FEATURES } from "./open5e2014/druid";
import { FIGHTER_FEATURES } from "./open5e2014/fighter";
import { MECHANIST_FEATURES } from "./open5e2014/mechanist";
import { MONK_FEATURES } from "./open5e2014/monk";
import { PALADIN_FEATURES } from "./open5e2014/paladin";
import { RANGER_FEATURES } from "./open5e2014/ranger";
import { ROGUE_FEATURES } from "./open5e2014/rogue";
import { SORCERER_FEATURES } from "./open5e2014/sorcerer";
import { WARLOCK_FEATURES } from "./open5e2014/warlock";
import { WIZARD_FEATURES } from "./open5e2014/wizard";

/**
 * The library's other 2014 archetypes: what each feature of the Open5e
 * subclasses beyond the SRD does (Tome of Heroes and Tal'Dorei via Kobold
 * Press, Open5e Originals, Black Flag), keyed by Open5e record key like the SRD
 * catalogues. Mechanics only; the rules text is on the row, under OGL 1.0a.
 *
 * Until 13 Oct 2026 these imported with empty mechanics, so 98 archetypes
 * listed their features and did nothing with them: no uses, no actions, no
 * rolls. Each entry was read from the feature's own text, one class per file,
 * and is held by open5e2014.test.ts to the parser and to the record keys the
 * library actually has (`open5e2014.keys.json`). A feature that only changes
 * what the character may do, with nothing to count, roll or choose, is absent:
 * a passive feature, as in the SRD catalogues.
 *
 * Pools shared with the base class use its key (`rage_uses`, `channel_divinity`,
 * `ki_points`, `bardic_inspiration`, `sorcery_points`, `lay_on_hands`), so a
 * feature that spends Rage spends the barbarian's Rage. A pool of the
 * archetype's own is keyed by archetype and feature.
 */
export const OPEN5E_2014_FEATURES: FeatureCatalogue = {
  ...BARBARIAN_FEATURES,
  ...BARD_FEATURES,
  ...CLERIC_FEATURES,
  ...DRUID_FEATURES,
  ...FIGHTER_FEATURES,
  ...MECHANIST_FEATURES,
  ...MONK_FEATURES,
  ...PALADIN_FEATURES,
  ...RANGER_FEATURES,
  ...ROGUE_FEATURES,
  ...SORCERER_FEATURES,
  ...WARLOCK_FEATURES,
  ...WIZARD_FEATURES,
};
