import {
  IconBookUser,
  IconDM,
  IconDungeon,
  IconGenerate,
  IconImages,
  IconLayers,
  IconMap,
  IconMonster,
  IconNavAtlas,
  IconNavCalendar,
  IconNavDashboard,
  IconNavEncounters,
  IconNavFactions,
  IconNavNotes,
  IconNavNpcs,
  IconNavPantheon,
  IconNavParty,
  IconNavQuests,
  IconNavReliquary,
  IconNavSettings,
  IconNavSoundboard,
  IconNavWorkshop,
  IconPackage,
  IconQuest,
  IconSpecies,
  IconUserCircle,
  IconWand,
} from "@/lib/icons";
import type { Component } from "vue";

export interface NavItem {
  label: string;
  to: string;
  icon: Component;
  description: string;
  /** If true, item is dimmed and non-navigable when no campaign is active */
  requiresCampaign?: boolean;
  /** If set, item is hidden when this built-in optional rule is disabled for the active campaign */
  ruleKey?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /**
   * Hide this group on mobile (<md). Use for tools that target letter/A4
   * output (Scriptorium, Card Forge, The Mint) where the editing surface
   * is impractical on a phone-sized viewport.
   */
  desktopOnly?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Campaign",
    items: [
      {
        label: "Dashboard",
        to: "/dashboard",
        icon: IconNavDashboard,
        description: "Campaign overview",
      },
      {
        label: "Notes",
        to: "/notes",
        icon: IconNavNotes,
        description: "Session notes & lore",
        requiresCampaign: true,
      },
      {
        label: "Calendar",
        to: "/calendar",
        icon: IconNavCalendar,
        description: "Faerûn timeline",
        requiresCampaign: true,
      },
      {
        label: "Quests",
        to: "/quests",
        icon: IconNavQuests,
        description: "Quest log & objectives",
        requiresCampaign: true,
      },
      {
        label: "Atlas",
        to: "/locations",
        icon: IconNavAtlas,
        description: "Realms, cities & dungeons",
        requiresCampaign: true,
      },
      {
        label: "Pantheon",
        to: "/deities",
        icon: IconNavPantheon,
        description: "Gods, deities & divine lore",
        requiresCampaign: true,
      },
      {
        label: "Factions",
        to: "/factions",
        icon: IconNavFactions,
        description: "Guilds, cults & powers",
        requiresCampaign: true,
      },
      {
        label: "NPCs",
        to: "/npcs",
        icon: IconNavNpcs,
        description: "Non-player characters",
        requiresCampaign: true,
      },
      {
        label: "Encounters",
        to: "/encounters",
        icon: IconNavEncounters,
        description: "Build & run combat",
        requiresCampaign: true,
      },
      {
        label: "Party",
        to: "/party",
        icon: IconNavParty,
        description: "Track heroes & initiative",
        requiresCampaign: true,
      },
      {
        label: "Workshop",
        to: "/crafting",
        icon: IconNavWorkshop,
        description: "Recipes & player crafting",
        requiresCampaign: true,
        ruleKey: "crafting",
      },
      {
        label: "Soundboard",
        to: "/soundboard",
        icon: IconNavSoundboard,
        description: "Ambient sounds & music",
        requiresCampaign: true,
      },
      {
        label: "Settings",
        to: "/campaign/settings",
        icon: IconNavSettings,
        description: "Campaign configuration",
        requiresCampaign: true,
      },
    ],
  },
  {
    label: "Reference",
    items: [
      {
        label: "Reliquary",
        to: "/rules",
        icon: IconNavReliquary,
        description: "DM screen, rules & custom systems",
      },
    ],
  },
  {
    label: "Assets",
    items: [
      {
        label: "Gallery",
        to: "/gallery",
        icon: IconImages,
        description: "Every image you've generated, in one place",
        requiresCampaign: true,
      },
      {
        label: "Bestiary",
        to: "/monsters",
        icon: IconMonster,
        description: "Monster builder & compendium",
      },
      {
        label: "Spellbook",
        to: "/spells",
        icon: IconGenerate,
        description: "Custom spell compendium",
      },
      {
        label: "Item Vault",
        to: "/vault",
        icon: IconPackage,
        description: "Equipment & magic items",
      },
      {
        label: "Dungeon Craft",
        to: "/dungeon-craft",
        icon: IconDungeon,
        description: "Secret doors, traps, hazards & dungeon enigmas",
      },
      {
        label: "Character Codex",
        to: "/codex",
        icon: IconSpecies,
        description:
          "Species, backgrounds, classes & archetypes for your players",
      },
      {
        label: "Hall of Heroes",
        to: "/hall-of-heroes",
        icon: IconDM,
        description: "Iconic characters importable into any campaign",
      },
    ],
  },
  {
    label: "Publish",
    desktopOnly: true, // A4/letter-output tools — unusable on phone-sized viewports
    items: [
      {
        label: "Scriptorium",
        to: "/scriptorium",
        icon: IconQuest,
        description: "Craft & export documents",
      },
      {
        label: "Character Sheet",
        to: "/party",
        icon: IconBookUser,
        description: "Export printable character sheets (select a party member)",
      },
      {
        label: "Card Forge",
        to: "/forge",
        icon: IconLayers,
        description: "Print NPC & monster cards",
      },
      {
        label: "The Mint",
        to: "/tokens",
        icon: IconUserCircle,
        description: "Create VTT tokens & coins",
      },
      {
        label: "Illuminator",
        to: "/illuminate",
        icon: IconWand,
        description: "Apply torn-edge effects to images",
      },
      {
        label: "Cartographer",
        to: "/cartographer",
        icon: IconMap,
        description: "Paint battle maps & dungeon layouts",
      },
    ],
  },
];

// Flat list kept for any consumers that still need it
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
