import type { Component } from "vue";
import {
  IconNavAtlas,
  IconNavBestiary,
  IconNavCalendar,
  IconNavCharacterSheet,
  IconNavDashboard,
  IconNavFactions,
  IconNavHearth,
  IconNavInterlude,
  IconNavItemVault,
  IconNavParty,
  IconNavQuests,
  IconNavReliquary,
  IconNavSpellbook,
  IconNavWorkshop,
} from "@/lib/icons";

export interface PlayerNavItem {
  /** Stable identity, what a saved tab order stores. `to` may change; this may not. */
  id: string;
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
  { id: "hearth", to: "/play", label: "Hearth", icon: IconNavHearth },
  { id: "character", to: "/play/character", label: "Character", icon: IconNavCharacterSheet },
  { id: "spells", to: "/play/spells", label: "Spellbook", icon: IconNavSpellbook },
  { id: "journal", to: "/play/journal", label: "Journal", icon: IconNavQuests },
  { id: "inventory", to: "/play/inventory", label: "Inventory", icon: IconNavItemVault },
  { id: "calendar", to: "/play/calendar", label: "Calendar", icon: IconNavCalendar },
  { id: "party", to: "/play/party", label: "People", icon: IconNavParty },
  { id: "crafting", to: "/play/crafting", label: "Workshop", icon: IconNavWorkshop, ruleKey: "crafting" },
  { id: "downtime", to: "/play/downtime", label: "Interlude", icon: IconNavInterlude, ruleKey: "downtime" },
  { id: "atlas", to: "/play/atlas", label: "Atlas", icon: IconNavAtlas },
  { id: "bestiary", to: "/play/bestiary", label: "Bestiary", icon: IconNavBestiary },
  { id: "rules", to: "/play/rules", label: "Reliquary", icon: IconNavReliquary },
  { id: "factions", to: "/play/factions", label: "Factions", icon: IconNavFactions },
  // The cross-campaign character pool (#730). Last by default so it lives in
  // the More sheet for players mid-campaign; for a player with no campaign
  // membership it is the only tab (see usePlayerNavPrefs). Reuses the DM
  // dashboard glyph — home is home.
  { id: "home", to: "/play/home", label: "Home", icon: IconNavDashboard, standalone: true },
];

/**
 * Whether a nav tab is the current page. `/play` (Hearth) is exact, because
 * every player route lives under it; the rest match their own subtree, on a
 * segment boundary so `/play/character` never lights for `/play/characterfoo`.
 */
export function isNavItemActive(to: string, path: string): boolean {
  if (to === "/play") return path === "/play";
  return path === to || path.startsWith(to + "/");
}

export const MOBILE_NAV_SLOTS = 4;
export const TABLET_NAV_SLOTS = 7;
