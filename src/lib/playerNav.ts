import type { Component } from "vue";
import { IconBookMarked, IconCalendarDays, IconCraft, IconDM, IconFaction, IconInventory, IconLandmark, IconLibrary, IconMonster, IconPenLine, IconPuzzle, IconShield, IconUser } from '@/lib/icons';

export interface PlayerNavItem {
  to: string;
  label: string;
  icon: Component;
}

export const ALL_PLAYER_NAV: PlayerNavItem[] = [
  { to: "/play",           label: "Character",  icon: IconUser },
  { to: "/play/champions", label: "Champions",  icon: IconDM },
  { to: "/play/party",     label: "People",     icon: IconShield },
  { to: "/play/inventory", label: "Inventory",  icon: IconInventory },
  { to: "/play/calendar",  label: "Calendar",   icon: IconCalendarDays },
  { to: "/play/journal",   label: "Journal",    icon: IconPenLine },
  { to: "/play/crafting",  label: "Workshop",   icon: IconCraft },
  { to: "/play/factions",  label: "Factions",   icon: IconLandmark },
  { to: "/play/puzzles",   label: "Puzzles",    icon: IconPuzzle },
  { to: "/play/atlas",     label: "Atlas",      icon: IconFaction },
  { to: "/play/bestiary",  label: "Bestiary",   icon: IconMonster },
  { to: "/play/spells",    label: "Spellbook",  icon: IconBookMarked },
  { to: "/play/rules",     label: "Reliquary",  icon: IconLibrary },
];

export const MOBILE_NAV_SLOTS = 4;
export const TABLET_NAV_SLOTS = 7;
