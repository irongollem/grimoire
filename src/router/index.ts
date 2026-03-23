import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // ── Auth (no sidebar layout) ──────────────────────────────────────────
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/auth/LoginView.vue"),
      meta: { layout: "auth", requiresGuest: true },
    },
    {
      path: "/signup",
      name: "signup",
      component: () => import("@/views/auth/SignupView.vue"),
      meta: { layout: "auth", requiresGuest: true },
    },

    // ── Invite join (auth layout, accessible before login) ────────────────
    {
      path: "/join/:token",
      name: "join-campaign",
      component: () => import("@/views/auth/JoinCampaignView.vue"),
      meta: { layout: "auth" },
    },

    // ── Player portal ─────────────────────────────────────────────────────
    {
      path: "/play",
      name: "play",
      component: () => import("@/views/play/PlayerCharacterView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Your Character" },
    },
    {
      path: "/play/party",
      name: "play-party",
      component: () => import("@/views/play/PlayerPartyView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Party" },
    },
    {
      path: "/play/quests",
      name: "play-quests",
      component: () => import("@/views/play/PlayerQuestsView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Quest Log" },
    },
    {
      path: "/play/quests/:id",
      name: "play-quest-detail",
      component: () => import("@/views/play/PlayerQuestDetailView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Quest" },
    },
    {
      path: "/play/journal",
      name: "play-journal",
      component: () => import("@/views/play/PlayerJournalView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Journal" },
    },
    {
      path: "/play/notes",
      name: "play-notes",
      component: () => import("@/views/play/PlayerNotesView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Notes" },
    },
    {
      path: "/play/inventory",
      name: "play-inventory",
      component: () => import("@/views/play/PlayerInventoryView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Party Inventory" },
    },
    {
      path: "/play/crafting",
      name: "play-crafting",
      component: () => import("@/views/play/PlayerCraftingView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Workshop" },
    },
    {
      path: "/play/encounter",
      name: "player-encounter",
      component: () => import("@/views/play/PlayerEncounterView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Live Encounter" },
    },
    {
      path: "/play/npcs",
      name: "play-npcs",
      component: () => import("@/views/play/PlayerNpcsView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "People" },
    },
    {
      path: "/play/factions",
      name: "play-factions",
      component: () => import("@/views/play/PlayerFactionsView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Factions" },
    },
    {
      path: "/play/rules",
      name: "play-rules",
      component: () => import("@/views/play/PlayerReliquaryView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Reliquary" },
    },
    {
      path: "/play/settings",
      name: "play-settings",
      component: () => import("@/views/play/PlayerSettingsView.vue"),
      meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Settings" },
    },
    // ── App ───────────────────────────────────────────────────────────────
    {
      path: "/",
      redirect: "/dashboard",
    },
    {
      path: "/dashboard",
      name: "dashboard",
      component: () => import("@/views/DashboardView.vue"),
      meta: { requiresAuth: true, title: "Campaign Dashboard" },
    },

    // Notes
    {
      path: "/notes",
      name: "notes",
      component: () => import("@/views/notes/NotesView.vue"),
      meta: { requiresAuth: true, title: "Campaign Notes" },
    },
    {
      path: "/notes/new",
      name: "note-new",
      component: () => import("@/views/notes/NoteDetailView.vue"),
      meta: { requiresAuth: true, title: "New Note" },
    },
    {
      path: "/notes/:id",
      name: "note-detail",
      component: () => import("@/views/notes/NoteDetailView.vue"),
      meta: { requiresAuth: true, title: "Note" },
    },

    // Calendar
    {
      path: "/calendar",
      name: "calendar",
      component: () => import("@/views/calendar/CalendarView.vue"),
      meta: { requiresAuth: true, title: "Faerûn Calendar" },
    },

    // Scriptorium
    {
      path: "/scriptorium",
      name: "scriptorium",
      component: () => import("@/views/scriptorium/ScriptoriumView.vue"),
      meta: { requiresAuth: true, title: "Scriptorium" },
    },
    {
      path: "/scriptorium/new",
      name: "scriptorium-new",
      component: () => import("@/views/scriptorium/ScriptoriumEditorView.vue"),
      meta: { requiresAuth: true, title: "New Document" },
    },
    {
      path: "/scriptorium/:id",
      name: "scriptorium-editor",
      component: () => import("@/views/scriptorium/ScriptoriumEditorView.vue"),
      meta: { requiresAuth: true, title: "Edit Document" },
    },

    // NPCs
    {
      path: "/npcs",
      name: "npcs",
      component: () => import("@/views/npcs/NpcsView.vue"),
      meta: { requiresAuth: true, title: "NPC Tracker" },
    },
    {
      path: "/npcs/new",
      name: "npc-new",
      component: () => import("@/views/npcs/NpcDetailView.vue"),
      meta: { requiresAuth: true, title: "New NPC" },
    },
    {
      path: "/npcs/:id",
      name: "npc-detail",
      component: () => import("@/views/npcs/NpcDetailView.vue"),
      meta: { requiresAuth: true, title: "NPC Sheet" },
    },

    // Monsters
    {
      path: "/monsters",
      name: "monsters",
      component: () => import("@/views/monsters/MonstersView.vue"),
      meta: { requiresAuth: true, title: "Bestiary" },
    },
    {
      path: "/monsters/new",
      name: "monster-new",
      component: () => import("@/views/monsters/MonsterDetailView.vue"),
      meta: { requiresAuth: true, title: "New Monster" },
    },
    {
      path: "/monsters/:id",
      name: "monster-detail",
      component: () => import("@/views/monsters/MonsterDetailView.vue"),
      meta: { requiresAuth: true, title: "Monster" },
    },

    // Party
    {
      path: "/party",
      name: "party",
      component: () => import("@/views/party/PartyView.vue"),
      meta: { requiresAuth: true, title: "Party Tracker" },
    },
    {
      path: "/party/:id",
      name: "party-member",
      component: () => import("@/views/party/PartyMemberView.vue"),
      meta: { requiresAuth: true, title: "Character Sheet" },
    },

    // Spells
    {
      path: "/spells",
      name: "spells",
      component: () => import("@/views/spells/SpellsView.vue"),
      meta: { requiresAuth: true, title: "Spellbook" },
    },
    {
      path: "/spells/new",
      name: "spell-new",
      component: () => import("@/views/spells/SpellDetailView.vue"),
      meta: { requiresAuth: true, title: "New Spell" },
    },
    {
      path: "/spells/:id",
      name: "spell-detail",
      component: () => import("@/views/spells/SpellDetailView.vue"),
      meta: { requiresAuth: true, title: "Spell" },
    },

    // Vault (Items)
    {
      path: "/vault",
      name: "vault",
      component: () => import("@/views/items/ItemsView.vue"),
      meta: { requiresAuth: true, title: "Vault" },
    },
    {
      path: "/vault/new",
      name: "item-new",
      component: () => import("@/views/items/ItemDetailView.vue"),
      meta: { requiresAuth: true, title: "New Item" },
    },
    {
      path: "/vault/:id",
      name: "item-detail",
      component: () => import("@/views/items/ItemDetailView.vue"),
      meta: { requiresAuth: true, title: "Item" },
    },

    // Encounters
    {
      path: "/encounters",
      name: "encounters",
      component: () => import("@/views/encounters/EncountersView.vue"),
      meta: { requiresAuth: true, title: "Encounters" },
    },
    {
      path: "/encounters/new",
      name: "encounter-new",
      component: () => import("@/views/encounters/EncounterDetailView.vue"),
      meta: { requiresAuth: true, title: "New Encounter" },
    },
    {
      path: "/encounters/:id",
      name: "encounter-detail",
      component: () => import("@/views/encounters/EncounterDetailView.vue"),
      meta: { requiresAuth: true, title: "Encounter Builder" },
    },
    {
      path: "/encounters/:id/run",
      name: "encounter-run",
      component: () => import("@/views/encounters/EncounterRunView.vue"),
      meta: { requiresAuth: true, title: "Combat Tracker" },
    },

    // Quests
    {
      path: "/quests",
      name: "quests",
      component: () => import("@/views/quests/QuestsView.vue"),
      meta: { requiresAuth: true, title: "Quest Log" },
    },
    {
      path: "/quests/new",
      name: "quest-new",
      component: () => import("@/views/quests/QuestDetailView.vue"),
      meta: { requiresAuth: true, title: "New Quest" },
    },
    {
      path: "/quests/:id",
      name: "quest-detail",
      component: () => import("@/views/quests/QuestDetailView.vue"),
      meta: { requiresAuth: true, title: "Quest" },
    },

    // Workshop (Crafting)
    {
      path: "/crafting",
      name: "crafting",
      component: () => import("@/views/crafting/CraftingView.vue"),
      meta: { requiresAuth: true, title: "Workshop" },
    },
    {
      path: "/crafting/new",
      name: "crafting-new",
      component: () => import("@/views/crafting/CraftingRecipeView.vue"),
      meta: { requiresAuth: true, title: "New Recipe" },
    },
    {
      path: "/crafting/:id",
      name: "crafting-detail",
      component: () => import("@/views/crafting/CraftingRecipeView.vue"),
      meta: { requiresAuth: true, title: "Recipe" },
    },

    // Atlas (Locations)
    {
      path: "/locations",
      name: "locations",
      component: () => import("@/views/locations/LocationsView.vue"),
      meta: { requiresAuth: true, title: "Atlas" },
    },
    {
      path: "/locations/new",
      name: "location-new",
      component: () => import("@/views/locations/LocationDetailView.vue"),
      meta: { requiresAuth: true, title: "New Location" },
    },
    {
      path: "/locations/:id",
      name: "location-detail",
      component: () => import("@/views/locations/LocationDetailView.vue"),
      meta: { requiresAuth: true, title: "Location" },
    },

    // Factions
    {
      path: "/factions",
      name: "factions",
      component: () => import("@/views/factions/FactionListView.vue"),
      meta: { requiresAuth: true, title: "Factions" },
    },
    {
      path: "/factions/new",
      name: "faction-new",
      component: () => import("@/views/factions/FactionDetailView.vue"),
      meta: { requiresAuth: true, title: "New Faction" },
    },
    {
      path: "/factions/:id",
      name: "faction-detail",
      component: () => import("@/views/factions/FactionDetailView.vue"),
      meta: { requiresAuth: true, title: "Faction" },
    },

    // Rules Reliquary
    {
      path: "/rules",
      name: "rules",
      component: () => import("@/views/rules/RulesView.vue"),
      meta: { requiresAuth: true, title: "Rules Reliquary" },
    },
    {
      path: "/rules/new",
      name: "rule-new",
      component: () => import("@/views/rules/RuleEditView.vue"),
      meta: { requiresAuth: true, title: "New Rule" },
    },
    {
      path: "/rules/:id",
      name: "rule-detail",
      component: () => import("@/views/rules/RuleEditView.vue"),
      meta: { requiresAuth: true, title: "Edit Rule" },
    },

    // Card Forge
    {
      path: "/forge",
      name: "forge",
      component: () => import("@/views/cardforge/CardForgeView.vue"),
      meta: { requiresAuth: true, title: "Card Forge" },
    },
    // The Mint
    {
      path: "/tokens",
      name: "tokens",
      component: () => import("@/views/tokenforge/TokenForgeView.vue"),
      meta: { requiresAuth: true, title: "The Mint" },
    },

    // 404
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/views/NotFoundView.vue"),
    },
  ],
});

// Auth + role navigation guard
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.initialize();
  console.info(`[router] navigating to ${String(to.name)} — ensuring fresh session`);
  await auth.ensureFreshSession();
  console.info(`[router] session ready, proceeding to ${String(to.name)}`);

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.meta.requiresGuest && auth.isAuthenticated) {
    return { name: "dashboard" };
  }

  // Players are redirected away from DM routes to the player portal
  if (auth.isAuthenticated && auth.isPlayer && !to.meta.requiresPlayer && to.name !== "join-campaign") {
    return { name: "play" };
  }

  // Players can't manually navigate to /play if they're actually a DM
  // Exception: DM preview mode lets the DM browse the player portal
  const ui = useUiStore();
  if (to.meta.requiresPlayer && auth.isDM && !ui.dmPreviewMode) {
    return { name: "dashboard" };
  }
});

export default router;
