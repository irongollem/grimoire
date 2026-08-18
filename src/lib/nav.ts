import {
  IconNavAtlas,
  IconNavBestiary,
  IconNavCalendar,
  IconNavCardForge,
  IconNavCartographer,
  IconNavCharacterSheet,
  IconNavCodex,
  IconNavDashboard,
  IconNavDungeonCraft,
  IconNavEncounters,
  IconNavFactions,
  IconNavGallery,
  IconNavHeroes,
  IconNavIlluminator,
  IconNavInterlude,
  IconNavItemVault,
  IconNavMint,
  IconNavNotes,
  IconNavNpcs,
  IconNavPantheon,
  IconNavParty,
  IconNavQuests,
  IconNavReliquary,
  IconNavScriptorium,
  IconNavSettings,
  IconNavSimulacrum,
  IconNavSoundboard,
  IconNavSpellbook,
  IconNavWorkshop,
} from "@/lib/icons";
import type { Component } from "vue";

export interface NavItem {
  label: string;
  to: string;
  icon: Component;
  description: string;
  /**
   * Shorter label for the bottom bar, where a tab is a ~4rem column under an
   * icon rather than a full-width row.
   *
   * Only set it where the real label is genuinely too long for that: the bar
   * already carries "Encounters" and "Soundboard" without trouble, so this is
   * not a licence to abbreviate everything. It exists because folding the bar's
   * hand-written tab list into this registry silently renamed one tab — the bar
   * had said "Items" for `/vault` and the registry says "Item Vault" — and the
   * shorter one was a deliberate choice worth keeping rather than a copy that
   * had drifted.
   */
  shortLabel?: string;
  /** If true, item is dimmed and non-navigable when no campaign is active */
  requiresCampaign?: boolean;
  /** If set, item is hidden when this built-in optional rule is disabled for the active campaign */
  ruleKey?: string;
  /** If set, item is hidden while the named feature's admin flag is "hidden" (see useSimulacrumConfig). */
  featureFlag?: "simulacrum";
  /**
   * Hide below `md`. For tools that target letter/A4 output (Scriptorium, Card
   * Forge, The Mint, …) where the editing surface is impractical on a phone.
   *
   * Per item rather than per group, which is where it used to live. The Publish
   * group happened to be uniformly A4-bound until Gallery joined it — and
   * Gallery is a list of images, perfectly usable on a phone, so inheriting a
   * group-level flag would have hidden it from the devices most likely to want
   * it.
   */
  desktopOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    /**
     * The campaign itself — the story you author and the things you reach for at
     * the table. Ordered by how often a DM actually opens them rather than by
     * when each was built, which is what the order used to be.
     *
     * Dashboard, Notes, Quests and Calendar lead because they are the session
     * loop: what happened, what is next, when. NPCs and Atlas follow as the two
     * things looked up mid-scene. Encounters and Soundboard sit with them
     * because they are live-play surfaces, not prep ones. Party is lower than
     * its importance suggests only because the Dashboard already shows it.
     * Factions, Pantheon, Workshop and Interlude are world-building you set up
     * once and revisit rarely. Settings is last everywhere, always.
     */
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
        label: "Quests",
        to: "/quests",
        icon: IconNavQuests,
        description: "Quest log & objectives",
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
        label: "NPCs",
        to: "/npcs",
        icon: IconNavNpcs,
        description: "Non-player characters",
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
        label: "Encounters",
        to: "/encounters",
        icon: IconNavEncounters,
        description: "Build & run combat",
        requiresCampaign: true,
      },
      {
        label: "Soundboard",
        to: "/soundboard",
        icon: IconNavSoundboard,
        description: "Ambient sounds & music",
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
        label: "Factions",
        to: "/factions",
        icon: IconNavFactions,
        description: "Guilds, cults & powers",
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
        label: "Workshop",
        to: "/crafting",
        icon: IconNavWorkshop,
        description: "Recipes & player crafting",
        requiresCampaign: true,
        ruleKey: "crafting",
      },
      {
        label: "Interlude",
        to: "/downtime",
        icon: IconNavInterlude,
        description: "Downtime draws & outcomes",
        requiresCampaign: true,
        ruleKey: "downtime",
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
    /**
     * The 5e content a campaign draws on — statblocks, spells, items, species,
     * rules. Was called "Assets", next to a one-item "Reference" group holding
     * Reliquary alone.
     *
     * Both names had stopped describing the split. "Assets" implied a global
     * library standing apart from the campaign, and that stopped being true when
     * Bestiary, Spellbook and Item Vault gained per-campaign source gating
     * (`campaign_enabled_sources`) and `campaign_id` scoping: switching campaign
     * changes what is in them, exactly as it does for Notes. And a group label
     * over a single row is chrome that says nothing, so Reliquary — rules
     * content by any reading — joins the rest of the rules content.
     *
     * What actually separates this group from Campaign is not scope but kind:
     * above is the story you write, here is the material you write it from.
     *
     * These stay ungated (`requiresCampaign` unset) while every Campaign entry
     * is gated, and that is a preference rather than an oversight: the group is
     * a mix — Bestiary, Spellbook and Item Vault narrow to the active campaign,
     * while Hall of Heroes and most of the Codex do not — so there is no single
     * honest answer, and letting a DM browse content without first picking a
     * campaign is the friendlier one.
     */
    label: "Compendium",
    items: [
      {
        label: "Reliquary",
        to: "/rules",
        icon: IconNavReliquary,
        description: "DM screen, rules & custom systems",
      },
      {
        label: "Bestiary",
        to: "/monsters",
        icon: IconNavBestiary,
        description: "Monster builder & compendium",
      },
      {
        label: "Spellbook",
        to: "/spells",
        icon: IconNavSpellbook,
        description: "Custom spell compendium",
      },
      {
        label: "Item Vault",
        shortLabel: "Items",
        to: "/vault",
        icon: IconNavItemVault,
        description: "Equipment & magic items",
      },
      {
        label: "Character Codex",
        to: "/codex",
        icon: IconNavCodex,
        description:
          "Species, backgrounds, classes & archetypes for your players",
      },
      {
        label: "Dungeon Craft",
        to: "/dungeon-craft",
        icon: IconNavDungeonCraft,
        description: "Secret doors, traps, hazards & dungeon enigmas",
      },
      {
        label: "Hall of Heroes",
        to: "/hall-of-heroes",
        icon: IconNavHeroes,
        description: "Iconic characters importable into any campaign",
      },
    ],
  },
  {
    /**
     * Tools that turn a campaign into something outside the app — a PDF, a
     * printed card, a token, a mini, an image.
     *
     * Gallery moved here from "Assets": every image you have generated is the
     * output of these tools, not 5e content you build a campaign from.
     */
    label: "Publish",
    items: [
      {
        label: "Gallery",
        to: "/gallery",
        icon: IconNavGallery,
        description: "Every image you've generated, in one place",
        requiresCampaign: true,
      },
      {
        label: "Scriptorium",
        desktopOnly: true,
        to: "/scriptorium",
        icon: IconNavScriptorium,
        description: "Craft & export documents",
      },
      {
        label: "Character Sheet",
        desktopOnly: true,
        to: "/character-sheet",
        icon: IconNavCharacterSheet,
        description: "Export printable character sheets (select a party member)",
      },
      {
        label: "Card Forge",
        desktopOnly: true,
        to: "/forge",
        icon: IconNavCardForge,
        description: "Print NPC & monster cards",
      },
      {
        label: "The Mint",
        desktopOnly: true,
        to: "/tokens",
        icon: IconNavMint,
        description: "Create VTT tokens & coins",
      },
      {
        label: "Simulacrum",
        desktopOnly: true,
        to: "/minis",
        icon: IconNavSimulacrum,
        description: "Forge 3D minis from portraits",
        requiresCampaign: true,
        featureFlag: "simulacrum",
      },
      {
        label: "Illuminator",
        desktopOnly: true,
        to: "/illuminate",
        icon: IconNavIlluminator,
        description: "Apply torn-edge effects to images",
      },
      {
        label: "Cartographer",
        desktopOnly: true,
        to: "/cartographer",
        icon: IconNavCartographer,
        description: "Paint battle maps & dungeon layouts",
      },
    ],
  },
];
// Flat list kept for any consumers that still need it
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Which half of a session the DM is in. Mirrors `useUiStore().dmMode`. */
export type DmMode = "prep" | "play";

/**
 * What the bottom bar puts in reach, most important first — one pool per mode,
 * because the two halves of a session want different things: prep is building
 * the world, play is running it.
 *
 * Routes only. The bar used to carry its own `{ to, label, icon }` literals, a
 * second copy of ten entries that could disagree with the registry about an
 * icon or a label and never about anything loud enough to notice. Naming just
 * the route and resolving the rest through `sessionTabs()` leaves one
 * description of each destination.
 *
 * This deliberately mixes the sidebar's groups: at the table nobody is thinking
 * "is a monster campaign content or compendium content", they are thinking "I
 * need the statblock". Grouping is a browsing aid and belongs to the sidebar;
 * this is a reaching aid and is ranked purely by frequency.
 *
 * Rule-gated sections (Workshop, Interlude) stay out on purpose — the bar never
 * checks campaign rules, so an entry here would appear for campaigns that have
 * the rule switched off.
 */
export const SESSION_TAB_ROUTES: Record<DmMode, readonly string[]> = {
  prep: [
    "/npcs",
    "/locations",
    "/vault",
    "/quests",
    "/encounters",
    "/factions",
    "/deities",
    "/monsters",
    "/spells",
    "/notes",
  ],
  play: [
    "/dashboard",
    "/encounters",
    "/npcs",
    "/party",
    "/quests",
    "/soundboard",
    "/notes",
    "/locations",
    "/calendar",
    "/vault",
  ],
};

const NAV_BY_ROUTE = new Map(NAV_ITEMS.map((item) => [item.to, item]));

/**
 * The bar's tabs for a mode, resolved against the registry so label and icon
 * come from the same place the sidebar reads them.
 *
 * A route in `SESSION_TAB_ROUTES` with no registry entry is dropped rather than
 * rendered blank — that only happens if an item is removed from `NAV_GROUPS`
 * without being removed here, and a silently shorter bar is a better failure
 * than a tab with no icon and no name.
 */
export function sessionTabs(mode: DmMode): NavItem[] {
  return SESSION_TAB_ROUTES[mode]
    .map((to) => NAV_BY_ROUTE.get(to))
    .filter((item): item is NavItem => item !== undefined);
}

/**
 * The one place the featureFlag → visibility rule lives. Every nav consumer
 * (sidebar, mobile sheet, future ones) calls this instead of hand-writing the
 * predicate; adding a flagged feature means extending THIS function only.
 */
export function navItemHiddenByFlag(item: NavItem, simulacrumHidden: boolean): boolean {
  return item.featureFlag === "simulacrum" && simulacrumHidden;
}
