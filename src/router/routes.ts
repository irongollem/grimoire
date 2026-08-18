import type { RouteRecordRaw } from "vue-router";

export const routes: RouteRecordRaw[] = [
  // ── Root ──────────────────────────────────────────────────────────────
  // Marketing (landing, pricing, legal) now lives on the apex domain as a
  // separate Astro site; this app is served from app.dungeongrimoire.com and
  // owns no public marketing surface. Hitting the root sends authed users to
  // their dashboard and guests to login (via the dashboard route's guard).
  {
    path: "/",
    redirect: "/dashboard",
  },

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

  // ── First-run "What are you?" choice (#729) — the guard sends any
  //    authenticated account with no mode and no membership here.
  {
    path: "/welcome",
    name: "welcome",
    component: () => import("@/views/auth/WelcomeView.vue"),
    meta: { layout: "auth", requiresAuth: true, title: "Welcome" },
  },

  // ── OAuth consent (Supabase OAuth 2.1 Server redirects DMs here to approve
  //    an AI client connecting via the MCP server). Must be logged in to consent.
  {
    path: "/oauth/consent",
    name: "oauth-consent",
    component: () => import("@/views/auth/OAuthConsentView.vue"),
    meta: { layout: "auth", requiresAuth: true, title: "Authorize AI Connection" },
  },
  // Legal pages (privacy / terms / refunds) live on the marketing site —
  // see legalUrl() in src/lib/marketing.ts. The app links out to them.

  // ── Player portal ─────────────────────────────────────────────────────
  // `playerStandalone` marks the routes a player can use with no campaign
  // membership at all (#729/#730): the character pool and the creation flow
  // plus its picker sub-pages. Everything else in /play is campaign-scoped
  // and bounces a role-less player back to play-home.
  {
    path: "/play",
    name: "play",
    component: () => import("@/views/play/PlayerCharacterView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Your Character" },
  },
  {
    path: "/play/home",
    name: "play-home",
    component: () => import("@/views/play/PlayerHomeView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, playerStandalone: true, layout: "player", title: "Adventurer's Rest" },
  },
  {
    path: "/play/champions",
    name: "play-champions",
    component: () => import("@/views/play/PlayerChampionsView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Champions" },
  },
  {
    path: "/play/character/create",
    name: "play-character-create",
    component: () => import("@/views/play/PlayerCharacterCreateView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, playerStandalone: true, layout: "player", title: "Create Character" },
  },
  {
    path: "/play/character/edit",
    name: "play-character-edit",
    component: () => import("@/views/play/PlayerCharacterCreateView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, playerStandalone: true, layout: "player", title: "Edit Character" },
  },
  {
    path: "/play/character/levelup",
    name: "play-character-levelup",
    component: () => import("@/views/play/PlayerLevelUpView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Level Up" },
  },
  {
    path: "/play/character/sheet",
    name: "play-character-sheet",
    component: () => import("@/views/play/PlayerCharacterSheetView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Character Sheet" },
  },
  {
    path: "/play/party",
    name: "play-party",
    component: () => import("@/views/play/PlayerPartyView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Party" },
  },
  {
    path: "/play/quests",
    redirect: { path: "/play/journal", query: { tab: "quest-log" } },
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
    redirect: "/play/journal",
  },
  {
    path: "/play/inventory",
    name: "play-inventory",
    component: () => import("@/views/play/PlayerInventoryView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Party Inventory" },
  },
  {
    path: "/play/background",
    name: "play-background",
    component: () => import("@/views/play/PlayerBackgroundPickerView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, playerStandalone: true, layout: "player", title: "Choose Background" },
  },
  {
    path: "/play/species",
    name: "play-species",
    component: () => import("@/views/play/PlayerSpeciesPickerView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, playerStandalone: true, layout: "player", title: "Choose Species" },
  },
  {
    path: "/play/crafting",
    name: "play-crafting",
    component: () => import("@/views/play/PlayerCraftingView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Workshop" },
  },
  {
    path: "/play/downtime",
    name: "play-downtime",
    component: () => import("@/views/play/PlayerDowntimeView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "The Interlude" },
  },
  {
    path: "/play/encounter",
    name: "player-encounter",
    component: () => import("@/views/play/PlayerEncounterView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Live Encounter" },
  },
  {
    path: "/play/encounter/map",
    name: "player-encounter-map",
    component: () => import("@/views/play/PlayerEncounterMapView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Battle Map" },
  },
  {
    path: "/play/factions",
    name: "play-factions",
    component: () => import("@/views/play/PlayerFactionsView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Factions" },
  },
  {
    path: "/play/puzzles",
    redirect: { path: "/play/journal", query: { tab: "puzzles" } },
  },
  {
    path: "/play/puzzles/:id",
    name: "play-puzzle-detail",
    component: () => import("@/views/play/PlayerPuzzleDetailView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Puzzle" },
  },
  {
    path: "/play/rules",
    name: "play-rules",
    component: () => import("@/views/play/PlayerReliquaryView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Reliquary" },
  },
  {
    path: "/play/atlas",
    name: "play-atlas",
    component: () => import("@/views/play/PlayerLocationsView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Atlas" },
  },
  {
    path: "/play/bestiary",
    name: "play-bestiary",
    component: () => import("@/views/play/PlayerBestiaryView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Bestiary" },
  },
  {
    path: "/play/spells",
    name: "play-spells",
    component: () => import("@/views/play/PlayerSpellsView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Spellbook" },
  },
  {
    path: "/play/calendar",
    name: "play-calendar",
    component: () => import("@/views/play/PlayerCalendarView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Calendar" },
  },
  {
    path: "/play/settings",
    name: "play-settings",
    component: () => import("@/views/play/PlayerSettingsView.vue"),
    meta: { requiresAuth: true, requiresPlayer: true, layout: "player", title: "Settings" },
  },

  // ── App ───────────────────────────────────────────────────────────────
  {
    path: "/dashboard",
    name: "dashboard",
    component: () => import("@/views/DashboardView.vue"),
    meta: { requiresAuth: true, title: "Campaign Dashboard" },
  },
  {
    path: "/billing",
    name: "billing",
    component: () => import("@/views/BillingView.vue"),
    meta: { requiresAuth: true, title: "Billing & Subscription" },
  },
  {
    path: "/account",
    name: "account",
    component: () => import("@/views/AccountSettingsView.vue"),
    meta: { requiresAuth: true, title: "My Account" },
  },
  {
    path: "/campaign/settings",
    name: "campaign-settings",
    component: () => import("@/views/campaign/CampaignSettingsView.vue"),
    meta: { requiresAuth: true, title: "Campaign Settings" },
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
    // `:id` is a *child* so the grid stays mounted while a single NPC is being
    // read: on tablet and up the sheet is a modal over the list, and remounting
    // the list underneath it would throw away scroll position and the revealed
    // page of the infinite scroll — the two things the modal exists to keep.
    // `NpcDetailView` still takes the whole screen when it should (any phone
    // width, and `?edit=true` everywhere), and `NpcsView` renders nothing then.
    // See `useDetailModal`.
    children: [
      {
        path: ":id",
        name: "npc-detail",
        component: () => import("@/views/npcs/NpcDetailView.vue"),
        // fullscreenMobile: the mobile screen is a full-screen takeover with its
        // own top + bottom bars, so the global AppTopBar / DmBottomNav are
        // suppressed on phones to avoid two stacked, overlapping bars. Meta is
        // merged across matched records, so nesting does not hide it.
        meta: { requiresAuth: true, title: "NPC Sheet", fullscreenMobile: true },
      },
    ],
  },
  {
    path: "/npcs/new",
    name: "npc-new",
    component: () => import("@/views/npcs/NpcDetailView.vue"),
    // Deliberately NOT nested under /npcs: creating an NPC is the full editor at
    // every width, so there is no list to sit over. Static segments outrank the
    // `:id` param, so this still wins the match.
    // fullscreenMobile: the mobile edit screen is a full-screen takeover with
    // its own top + bottom bars, so the global AppTopBar / DmBottomNav are
    // suppressed on phones to avoid two stacked, overlapping bars. Desktop is
    // unaffected (the flag only applies below md).
    meta: { requiresAuth: true, title: "New NPC", fullscreenMobile: true },
  },
  {
    path: "/npcs/web",
    name: "npc-web",
    component: () => import("@/views/npcs/NpcWebView.vue"),
    meta: { requiresAuth: true, title: "Relationship Web" },
  },
  {
    path: "/npcs/sets",
    name: "npc-sets",
    component: () => import("@/views/npcs/NpcSetsView.vue"),
    meta: { requiresAuth: true, title: "NPC Sets" },
  },

  // Gallery — account-wide library of every generated image
  {
    path: "/gallery",
    name: "gallery",
    component: () => import("@/views/gallery/GalleryView.vue"),
    meta: { requiresAuth: true, title: "Gallery" },
  },

  // Simulacrum (portrait → 3D mini)
  {
    path: "/minis",
    name: "minis",
    component: () => import("@/views/minis/MinisView.vue"),
    meta: { requiresAuth: true, layout: "default", title: "Simulacrum" },
  },
  {
    path: "/minis/forge",
    name: "minis-forge",
    component: () => import("@/views/minis/SimulacrumForgeView.vue"),
    meta: { requiresAuth: true, layout: "default", title: "Simulacrum" },
  },
  // Monsters
  {
    path: "/monsters",
    name: "monsters",
    component: () => import("@/views/monsters/MonstersView.vue"),
    meta: { requiresAuth: true, title: "Bestiary" },
    // Same shape as `/npcs` — `:id` is a child so the bestiary grid stays
    // mounted while one monster is being read. See the note there.
    children: [
      {
        path: ":id",
        name: "monster-detail",
        component: () => import("@/views/monsters/MonsterDetailView.vue"),
        // fullscreenMobile: the mobile screen is a full-screen takeover with its
        // own top + bottom bars, so the global AppTopBar / DmBottomNav are
        // suppressed on phones to avoid two stacked, overlapping bars. Meta is
        // merged across matched records, so nesting does not hide it.
        meta: { requiresAuth: true, title: "Monster", fullscreenMobile: true },
      },
    ],
  },
  {
    path: "/monsters/new",
    name: "monster-new",
    component: () => import("@/views/monsters/MonsterDetailView.vue"),
    // Deliberately NOT nested under /monsters: creating a monster is the full
    // editor at every width, so there is no list to sit over. Static segments
    // outrank the `:id` param, so this still wins the match.
    // fullscreenMobile: the mobile edit screen is a full-screen takeover with
    // its own top + bottom bars, so the global AppTopBar / DmBottomNav are
    // suppressed on phones to avoid two stacked, overlapping bars. Desktop is
    // unaffected (the flag only applies below md).
    meta: { requiresAuth: true, title: "New Monster", fullscreenMobile: true },
  },

  // Party
  {
    path: "/party",
    name: "party",
    component: () => import("@/views/party/PartyView.vue"),
    meta: { requiresAuth: true, title: "Party Tracker" },
  },
  {
    path: "/party/new",
    name: "party-member-new",
    component: () => import("@/views/play/PlayerCharacterCreateView.vue"),
    meta: { requiresAuth: true, title: "Create Character" },
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

  // Dungeon Craft (tabbed hub: features + traps + puzzles)
  {
    path: "/dungeon-craft",
    name: "dungeon-craft",
    component: () => import("@/views/dungeon-features/DungeonCraftView.vue"),
    meta: { requiresAuth: true, title: "Dungeon Craft" },
  },
  { path: "/dungeon-features", redirect: "/dungeon-craft" },
  { path: "/traps",            redirect: { path: "/dungeon-craft", query: { tab: "traps" } } },
  { path: "/puzzles",          redirect: { path: "/dungeon-craft", query: { tab: "puzzles" } } },
  { path: "/roll-tables",      redirect: { path: "/dungeon-craft", query: { tab: "roll-tables" } } },
  { path: "/loot-tables",      redirect: { path: "/dungeon-craft", query: { tab: "loot-tables" } } },

  { path: "/roll-tables/new", redirect: { path: "/dungeon-craft", query: { tab: "roll-tables" } } },
  { path: "/roll-tables/:id", redirect: { path: "/dungeon-craft", query: { tab: "roll-tables" } } },

  // Cartographer — tile-based map editor (M1 skeleton; see context/features/cartographer.md)
  {
    path: "/cartographer",
    name: "cartographer-list",
    component: () => import("@/views/cartographer/CartographerListView.vue"),
    meta: { requiresAuth: true, title: "Cartographer" },
  },
  {
    path: "/cartographer/new",
    name: "cartographer-new",
    component: () => import("@/views/cartographer/CartographerEditorView.vue"),
    meta: { requiresAuth: true, title: "New Map" },
  },
  {
    path: "/cartographer/:id",
    name: "cartographer-editor",
    component: () => import("@/views/cartographer/CartographerEditorView.vue"),
    meta: { requiresAuth: true, title: "Edit Map" },
  },

  // Loot table detail
  {
    path: "/loot-tables/new",
    name: "loot-table-new",
    component: () => import("@/views/dungeon-features/LootTableDetailView.vue"),
    meta: { requiresAuth: true, title: "New Loot Table" },
  },
  {
    path: "/loot-tables/:id",
    name: "loot-table-detail",
    component: () => import("@/views/dungeon-features/LootTableDetailView.vue"),
    meta: { requiresAuth: true, title: "Loot Table" },
  },

  // Trap detail
  {
    path: "/traps/new",
    name: "trap-new",
    component: () => import("@/views/traps/TrapDetailView.vue"),
    meta: { requiresAuth: true, title: "New Trap" },
  },
  {
    path: "/traps/:id",
    name: "trap-detail",
    component: () => import("@/views/traps/TrapDetailView.vue"),
    meta: { requiresAuth: true, title: "Trap" },
  },

  // Dungeon feature detail
  {
    path: "/dungeon-features/new",
    name: "dungeon-feature-new",
    component: () => import("@/views/dungeon-features/DungeonFeatureDetailView.vue"),
    meta: { requiresAuth: true, title: "New Dungeon Feature" },
  },
  {
    path: "/dungeon-features/:id",
    name: "dungeon-feature-detail",
    component: () => import("@/views/dungeon-features/DungeonFeatureDetailView.vue"),
    meta: { requiresAuth: true, title: "Dungeon Feature" },
  },

  // Puzzle detail
  {
    path: "/puzzles/new",
    name: "puzzle-new",
    component: () => import("@/views/puzzles/PuzzleDetailView.vue"),
    meta: { requiresAuth: true, title: "New Puzzle" },
  },
  {
    path: "/puzzles/:id",
    name: "puzzle-detail",
    component: () => import("@/views/puzzles/PuzzleDetailView.vue"),
    meta: { requiresAuth: true, title: "Puzzle" },
  },

  // Character Codex
  {
    path: "/codex",
    redirect: "/codex/species",
  },
  {
    path: "/codex/:tab(species|backgrounds|classes|archetypes|abilities)",
    name: "codex",
    component: () => import("@/views/codex/CharacterCodexView.vue"),
    meta: { requiresAuth: true, playerReadable: true, title: "Character Codex" },
  },

  { path: "/species", redirect: "/codex/species" },
  {
    path: "/species/new",
    name: "species-new",
    component: () => import("@/views/species/SpeciesDetailView.vue"),
    meta: { requiresAuth: true, title: "New Species" },
  },
  {
    path: "/species/:id",
    name: "species-detail",
    component: () => import("@/views/species/SpeciesDetailView.vue"),
    meta: { requiresAuth: true, title: "Species" },
  },

  { path: "/features", redirect: "/codex/abilities" },
  {
    path: "/features/new",
    name: "feature-new",
    component: () => import("@/views/features/FeatureDetailView.vue"),
    meta: { requiresAuth: true, title: "New Ability" },
  },
  {
    path: "/features/:id",
    name: "feature-detail",
    component: () => import("@/views/features/FeatureDetailView.vue"),
    meta: { requiresAuth: true, title: "Ability" },
  },

  { path: "/levelup/custom", redirect: "/codex/archetypes" },
  {
    path: "/levelup/custom/new",
    name: "archetype-new",
    component: () => import("@/views/levelup/CustomSubclassEditorView.vue"),
    meta: { requiresAuth: true, title: "New Archetype" },
  },
  {
    path: "/levelup/custom/:id",
    name: "archetype-detail",
    component: () => import("@/views/levelup/CustomSubclassEditorView.vue"),
    meta: { requiresAuth: true, title: "Archetype" },
  },

  { path: "/levelup/classes", redirect: "/codex/classes" },
  {
    path: "/levelup/classes/new",
    name: "custom-class-new",
    component: () => import("@/views/levelup/CustomClassEditorView.vue"),
    meta: { requiresAuth: true, title: "New Class" },
  },
  {
    path: "/levelup/classes/:id",
    name: "custom-class-detail",
    component: () => import("@/views/levelup/CustomClassEditorView.vue"),
    meta: { requiresAuth: true, title: "Class" },
  },

  { path: "/backgrounds", redirect: "/codex/backgrounds" },
  {
    path: "/backgrounds/new",
    name: "background-new",
    component: () => import("@/views/backgrounds/BackgroundDetailView.vue"),
    meta: { requiresAuth: true, title: "New Background" },
  },
  {
    path: "/backgrounds/:id",
    name: "background-detail",
    component: () => import("@/views/backgrounds/BackgroundDetailView.vue"),
    meta: { requiresAuth: true, title: "Background" },
  },

  // Hall of Heroes
  {
    path: "/hall-of-heroes",
    name: "hall-of-heroes",
    component: () => import("@/views/HallOfHeroesView.vue"),
    meta: { requiresAuth: true, title: "Hall of Heroes" },
  },
  {
    path: "/hall-of-heroes/:id",
    name: "hero-detail",
    component: () => import("@/views/HeroDetailView.vue"),
    meta: { requiresAuth: true, title: "Hero" },
  },
  {
    path: "/hall-of-heroes/new",
    name: "hero-new",
    component: () => import("@/views/HeroEditorView.vue"),
    meta: { requiresAuth: true, title: "New Hero" },
  },
  {
    path: "/hall-of-heroes/:id/edit",
    name: "hero-edit",
    component: () => import("@/views/HeroEditorView.vue"),
    meta: { requiresAuth: true, title: "Edit Hero" },
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
  {
    path: "/encounters/:id/run/map",
    name: "encounter-run-map",
    component: () => import("@/views/encounters/EncounterMapView.vue"),
    meta: { requiresAuth: true, title: "Battle Map" },
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
  {
    path: "/quests/:id/beats/:beatId",
    name: "quest-beat-detail",
    component: () => import("@/views/quests/QuestBeatDetailView.vue"),
    meta: { requiresAuth: true, title: "Quest Beat" },
  },

  // Workshop (Crafting)
  {
    path: "/crafting",
    name: "crafting",
    component: () => import("@/views/crafting/CraftingView.vue"),
    meta: { requiresAuth: true, title: "Workshop" },
  },
  {
    path: "/downtime",
    name: "downtime",
    component: () => import("@/views/downtime/DowntimeBoardView.vue"),
    meta: { requiresAuth: true, title: "The Interlude" },
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

  // Deities (Pantheon)
  {
    path: "/deities",
    name: "deities",
    component: () => import("@/views/deities/DeityListView.vue"),
    meta: { requiresAuth: true, title: "Pantheon" },
  },
  {
    path: "/deities/new",
    name: "deity-new",
    component: () => import("@/views/deities/DeityDetailView.vue"),
    meta: { requiresAuth: true, title: "New Deity" },
  },
  {
    path: "/deities/:id",
    name: "deity-detail",
    component: () => import("@/views/deities/DeityDetailView.vue"),
    meta: { requiresAuth: true, title: "Deity" },
  },

  // Pantheons
  {
    path: "/pantheons",
    name: "pantheons",
    component: () => import("@/views/pantheons/PantheonListView.vue"),
    meta: { requiresAuth: true, title: "Pantheons" },
  },
  {
    path: "/pantheons/new",
    name: "pantheon-new",
    component: () => import("@/views/pantheons/PantheonDetailView.vue"),
    meta: { requiresAuth: true, title: "New Pantheon" },
  },
  {
    path: "/pantheons/:id",
    name: "pantheon-detail",
    component: () => import("@/views/pantheons/PantheonDetailView.vue"),
    meta: { requiresAuth: true, title: "Pantheon" },
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

  // Soundboard
  {
    path: "/soundboard",
    name: "soundboard",
    component: () => import("@/views/soundboard/SoundboardView.vue"),
    meta: { requiresAuth: true, title: "Soundboard" },
  },
  {
    // The CC-BY half of the curated library has to be credited somewhere in
    // the app; this is that somewhere.
    path: "/soundboard/credits",
    name: "sound-library-credits",
    component: () => import("@/views/soundboard/SoundLibraryCreditsView.vue"),
    meta: { requiresAuth: true, title: "Sound library credits" },
  },
  {
    path: "/spotify/callback",
    name: "spotify-callback",
    component: () => import("@/views/soundboard/SpotifyCallbackView.vue"),
    meta: { layout: "auth" },
  },

  // Card Forge
  {
    path: "/forge",
    name: "forge",
    component: () => import("@/views/cardforge/CardForgeView.vue"),
    meta: { requiresAuth: true, title: "Card Forge" },
  },
  // Character Sheet Export
  {
    path: "/character-sheet",
    name: "character-sheet-picker",
    component: () => import("@/views/publishing/CharacterSheetView.vue"),
    meta: { requiresAuth: true, title: "Character Sheet" },
  },
  {
    path: "/character-sheet/:partyMemberId",
    name: "character-sheet",
    component: () => import("@/views/publishing/CharacterSheetView.vue"),
    meta: { requiresAuth: true, title: "Character Sheet" },
  },
  // The Mint
  {
    path: "/tokens",
    name: "tokens",
    component: () => import("@/views/tokenforge/TokenForgeView.vue"),
    meta: { requiresAuth: true, title: "The Mint" },
  },
  // Illuminator
  {
    path: "/illuminate",
    name: "illuminate",
    component: () => import("@/views/illuminate/IlluminatorView.vue"),
    meta: { requiresAuth: true, title: "Illuminator" },
  },

  // Admin
  {
    path: "/admin",
    name: "admin",
    component: () => import("@/views/admin/AdminView.vue"),
    meta: { requiresAuth: true, requiresAdmin: true, title: "Admin" },
  },

  // Dev-only: the Paged.js spike harness (SCRIPTORIUM_PLAN.md §3 / issue #330),
  // sheet calibration, and the component catalogue (#622). Registered in dev and
  // in Vercel preview builds — so a PR's preview can be used to review them — but
  // never in production.
  ...(import.meta.env.DEV || __PREVIEW_BUILD__
    ? [
        {
          path: "/spike/pagedjs",
          name: "spike-pagedjs",
          // No auth: lets headless Chrome print-to-PDF hit it directly.
          // Dev-only — this route does not exist in production builds.
          component: () => import("@/views/spike/SpikePagedJsView.vue"),
          meta: { requiresAuth: false, title: "Paged.js Spike" },
        },
        {
          path: "/dev/sheet-calibration",
          name: "sheet-calibration",
          // No auth: lets a headless browser hit it directly with query params
          // to drive theme/side/size/debug for screenshot-based calibration.
          component: () => import("@/views/dev/SheetCalibrationView.vue"),
          meta: { requiresAuth: false, title: "Sheet Calibration" },
        },
        {
          path: "/dev/components",
          name: "component-catalogue",
          // No auth, same reason as above: a headless pass screenshots the
          // primitives per theme via ?theme=<id> to catch visual drift that
          // lint, typecheck and unit tests cannot see (#622).
          component: () => import("@/views/dev/ComponentCatalogueView.vue"),
          meta: { requiresAuth: false, title: "Component Catalogue" },
        },
      ]
    : []),

  // 404
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("@/views/NotFoundView.vue"),
  },
];
