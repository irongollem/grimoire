import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";

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

    // Locations
    {
      path: "/locations",
      name: "locations",
      component: () => import("@/views/locations/LocationsView.vue"),
      meta: { requiresAuth: true, title: "Locations" },
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

    // Card Forge
    {
      path: "/forge",
      name: "forge",
      component: () => import("@/views/cardforge/CardForgeView.vue"),
      meta: { requiresAuth: true, title: "Card Forge" },
    },

    // 404
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("@/views/NotFoundView.vue"),
    },
  ],
});

// Auth navigation guard
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  await auth.initialize();

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "login", query: { redirect: to.fullPath } };
  }
  if (to.meta.requiresGuest && auth.isAuthenticated) {
    return { name: "dashboard" };
  }
});

export default router;
