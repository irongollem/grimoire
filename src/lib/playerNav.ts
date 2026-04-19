import type { Component } from "vue";
import {
  BookOpen, Crown, Globe, Hammer, Landmark, Library, Package,
  PenLine, Puzzle, ScrollText, Settings, Shield, Skull, Sparkles, Swords, User,
} from "lucide-vue-next";

export interface PlayerNavItem {
  to: string;
  label: string;
  icon: Component;
}

export const ALL_PLAYER_NAV: PlayerNavItem[] = [
  { to: "/play",           label: "Character",  icon: User },
  { to: "/play/champions", label: "Champions",  icon: Crown },
  { to: "/play/party",     label: "People",    icon: Shield },
  { to: "/play/inventory", label: "Inventory", icon: Package },
  { to: "/play/quests",    label: "Quests",    icon: ScrollText },
  { to: "/play/encounter", label: "Encounter", icon: Swords },
  { to: "/play/journal",   label: "Journal",   icon: PenLine },
  { to: "/play/notes",     label: "DM Notes",  icon: BookOpen },
  { to: "/play/crafting",  label: "Workshop",  icon: Hammer },
  { to: "/play/factions",  label: "Factions",  icon: Landmark },
  { to: "/play/puzzles",   label: "Puzzles",   icon: Puzzle },
  { to: "/play/atlas",     label: "Atlas",     icon: Globe },
  { to: "/play/bestiary",  label: "Bestiary",  icon: Skull },
  { to: "/play/spells",    label: "Spells",    icon: Sparkles },
  { to: "/play/rules",     label: "Reliquary", icon: Library },
  { to: "/play/settings",  label: "Settings",  icon: Settings },
];

export const MOBILE_NAV_SLOTS = 4;
export const TABLET_NAV_SLOTS = 7;
