import {
  LayoutDashboard,
  BookOpen,
  CalendarDays,
  Scroll,
  Users,
  Skull,
  Shield,
  Layers,
  Sparkles,
} from "lucide-vue-next";
import type { Component } from "vue";

export interface NavItem {
  label: string;
  to: string;
  icon: Component;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Campaign",
    items: [
      {
        label: "Dashboard",
        to: "/dashboard",
        icon: LayoutDashboard,
        description: "Campaign overview",
      },
      {
        label: "Notes",
        to: "/notes",
        icon: BookOpen,
        description: "Session notes & lore",
      },
      {
        label: "Calendar",
        to: "/calendar",
        icon: CalendarDays,
        description: "Faerûn timeline",
      },
    ],
  },
  {
    label: "Assets",
    items: [
      {
        label: "Party",
        to: "/party",
        icon: Shield,
        description: "Track heroes & initiative",
      },
      {
        label: "NPCs",
        to: "/npcs",
        icon: Users,
        description: "Non-player characters",
      },
      {
        label: "Bestiary",
        to: "/monsters",
        icon: Skull,
        description: "Monster builder & compendium",
      },
      {
        label: "Spellbook",
        to: "/spells",
        icon: Sparkles,
        description: "Custom spell compendium",
      },
    ],
  },
  {
    label: "Publish",
    items: [
      {
        label: "Scriptorium",
        to: "/scriptorium",
        icon: Scroll,
        description: "Craft & export documents",
      },
      {
        label: "Card Forge",
        to: "/forge",
        icon: Layers,
        description: "Print NPC & monster cards",
      },
    ],
  },
];

// Flat list kept for any consumers that still need it
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
