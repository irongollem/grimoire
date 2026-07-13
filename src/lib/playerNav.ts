import type { Component } from "vue";
import {
  IconNavAtlas,
  IconNavBestiary,
  IconNavCalendar,
  IconNavCharacterSheet,
  IconNavFactions,
  IconNavItemVault,
  IconNavParty,
  IconNavQuests,
  IconNavReliquary,
  IconNavSpellbook,
  IconNavWorkshop,
} from "@/lib/icons";

export interface PlayerNavItem {
  to: string;
  label: string;
  icon: Component;
  /**
   * Hides this tab when the named optional rule is disabled for the campaign,
   * mirroring `NavItem.ruleKey` on the DM sidebar. Without it a player keeps
   * seeing a portal tab for a module the DM has switched off.
   */
  ruleKey?: string;
}

// Uses the hand-drawn custom nav glyphs (IconNav*) so the player portal matches
// the DM nav. Inventory reuses the Item Vault glyph and Journal reuses the
// Quests glyph (no dedicated backpack/journal glyph exists).
export const ALL_PLAYER_NAV: PlayerNavItem[] = [
  { to: "/play", label: "Character", icon: IconNavCharacterSheet },
  { to: "/play/inventory", label: "Inventory", icon: IconNavItemVault },
  { to: "/play/spells", label: "Spellbook", icon: IconNavSpellbook },
  { to: "/play/party", label: "People", icon: IconNavParty },
  { to: "/play/calendar", label: "Calendar", icon: IconNavCalendar },
  { to: "/play/journal", label: "Journal", icon: IconNavQuests },
  { to: "/play/crafting", label: "Workshop", icon: IconNavWorkshop, ruleKey: "crafting" },
  // Interlude reuses the Calendar glyph — no downtime-specific glyph exists yet.
  { to: "/play/downtime", label: "Interlude", icon: IconNavCalendar, ruleKey: "downtime" },
  { to: "/play/atlas", label: "Atlas", icon: IconNavAtlas },
  { to: "/play/bestiary", label: "Bestiary", icon: IconNavBestiary },
  { to: "/play/rules", label: "Reliquary", icon: IconNavReliquary },
  { to: "/play/factions", label: "Factions", icon: IconNavFactions },
];

export const MOBILE_NAV_SLOTS = 4;
export const TABLET_NAV_SLOTS = 7;
