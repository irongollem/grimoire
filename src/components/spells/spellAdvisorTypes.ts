/**
 * Shared prop types for SpellLevelAdvisorModal and SpellLevelAdvisorPanel.
 * Re-exports from spellAdvisor lib are inlined here to avoid prop-type coupling.
 */
import type {
  EffectType,
  EffectIntensity,
  TargetingMode,
  SaveType,
  DurationTier,
  AdvisorResult,
} from "@/lib/spells/spellAdvisor";

export type { AdvisorResult };

export interface AdvisorState {
  effectType: EffectType;
  effectIntensity: EffectIntensity;
  damageDice: string;
  targetingMode: TargetingMode;
  saveType: SaveType;
  durationTier: DurationTier;
  requiresConcentration: boolean;
  hasSecondaryEffect: boolean;
  isRitual: boolean;
  repeatSave: boolean;
  endsWhenHarmed: boolean;
  limitedKinds: boolean;
  canBreakFree: boolean;
}

export interface SchoolTip {
  title: string;
  tips: string[];
}

export interface RefSpells {
  control?: string;
  buff?: string;
  utility?: string;
}
