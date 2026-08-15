import type { Component } from "vue";
import {
  IconNavAtlas,
  IconNavBestiary,
  IconNavCalendar,
  IconNavCharacterSheet,
  IconNavDashboard,
  IconNavFactions,
  IconNavInterlude,
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
  /** Available even when no campaign membership is currently active. */
  standalone?: boolean;
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
  { to: "/play/downtime", label: "Interlude", icon: IconNavInterlude, ruleKey: "downtime" },
  { to: "/play/atlas", label: "Atlas", icon: IconNavAtlas },
  { to: "/play/bestiary", label: "Bestiary", icon: IconNavBestiary },
  { to: "/play/rules", label: "Reliquary", icon: IconNavReliquary },
  { to: "/play/factions", label: "Factions", icon: IconNavFactions },
  // The cross-campaign character pool (#730). Last by default so it lives in
  // the More sheet for players mid-campaign; for a player with no campaign
  // membership it is the only tab (see usePlayerNavPrefs). Reuses the DM
  // dashboard glyph — home is home.
  { to: "/play/home", label: "Home", icon: IconNavDashboard, standalone: true },
];

export const MOBILE_NAV_SLOTS = 4;
export const TABLET_NAV_SLOTS = 7;
