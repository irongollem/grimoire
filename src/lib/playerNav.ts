import type { Component } from "vue";
import {
  IconInventory,
  IconNavAtlas,
  IconNavBestiary,
  IconNavCalendar,
  IconNavCharacterSheet,
  IconNavFactions,
  IconNavParty,
  IconNavReliquary,
  IconNavSpellbook,
  IconNavWorkshop,
  IconPenLine,
} from "@/lib/icons";

export interface PlayerNavItem {
  to: string;
  label: string;
  icon: Component;
}

// Uses the hand-drawn custom nav glyphs (IconNav*) so the player portal matches
// the DM nav. Two items reuse Lucide icons because no custom glyph exists yet —
// Inventory (no backpack glyph) and Journal (no journal glyph). Swap them in
// here once those glyphs are drawn.
export const ALL_PLAYER_NAV: PlayerNavItem[] = [
  { to: "/play", label: "Character", icon: IconNavCharacterSheet },
  { to: "/play/inventory", label: "Inventory", icon: IconInventory },
  { to: "/play/spells", label: "Spellbook", icon: IconNavSpellbook },
  { to: "/play/party", label: "People", icon: IconNavParty },
  { to: "/play/calendar", label: "Calendar", icon: IconNavCalendar },
  { to: "/play/journal", label: "Journal", icon: IconPenLine },
  { to: "/play/crafting", label: "Workshop", icon: IconNavWorkshop },
  { to: "/play/atlas", label: "Atlas", icon: IconNavAtlas },
  { to: "/play/bestiary", label: "Bestiary", icon: IconNavBestiary },
  { to: "/play/rules", label: "Reliquary", icon: IconNavReliquary },
  { to: "/play/factions", label: "Factions", icon: IconNavFactions },
];

export const MOBILE_NAV_SLOTS = 4;
export const TABLET_NAV_SLOTS = 7;
