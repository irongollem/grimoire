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
  Package,
  Swords,
  Globe,
  ScrollText,
} from "lucide-vue-next";
import type { Component } from "vue";

export interface NavItem {
  label: string;
  to: string;
  icon: Component;
  description: string;
  /** If true, item is dimmed and non-navigable when no campaign is active */
  requiresCampaign?: boolean;
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
        requiresCampaign: true,
      },
      {
        label: "Calendar",
        to: "/calendar",
        icon: CalendarDays,
        description: "Faerûn timeline",
        requiresCampaign: true,
      },
      {
        label: "Party",
        to: "/party",
        icon: Shield,
        description: "Track heroes & initiative",
        requiresCampaign: true,
      },
      {
        label: "NPCs",
        to: "/npcs",
        icon: Users,
        description: "Non-player characters",
        requiresCampaign: true,
      },
      {
        label: "Encounters",
        to: "/encounters",
        icon: Swords,
        description: "Build & run combat",
        requiresCampaign: true,
      },
      {
        label: "Quests",
        to: "/quests",
        icon: ScrollText,
        description: "Quest log & objectives",
        requiresCampaign: true,
      },
      {
        label: "Atlas",
        to: "/locations",
        icon: Globe,
        description: "Realms, cities & dungeons",
        requiresCampaign: true,
      },
    ],
  },
  {
    label: "Assets",
    items: [
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
      {
        label: "Item Vault",
        to: "/vault",
        icon: Package,
        description: "Equipment & magic items",
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
