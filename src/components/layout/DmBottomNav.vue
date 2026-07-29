<template>
  <!-- Docked, mode-aware bottom navigation. Serves touch-first devices and
       narrow windows (barnav) — pointer type, not width, decides. See the
       barnav/sidenav custom variants in src/assets/main.css. Only DMs see
       it; players have their own portal nav. -->
  <nav
    v-if="isDm"
    class="fixed inset-x-0 bottom-0 z-40 flex justify-center border-t border-border bg-card px-1.5 sidenav:hidden md:px-4"
    :style="barStyle"
  >
    <div class="grid w-full grid-cols-5 items-end md:flex md:w-auto">
      <template v-for="slot in barSlots" :key="slot.key">
        <!-- Center action: Prep = create FAB, Play = dice roller -->
        <div v-if="slot.kind === 'fab'" class="flex justify-center md:w-22 md:shrink-0">
          <!-- Prep: a gold "+" create FAB, raised above the bar -->
          <button
            v-if="ui.dmMode === 'prep'"
            type="button"
            class="-mt-7 flex h-14 w-14 items-center justify-center rounded-full border-[0.1875rem] border-card bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95"
            aria-label="Create"
            @click="onCreate"
          >
            <IconAdd class="h-6 w-6" />
          </button>

          <!-- Play: reuse the existing DiceRoller, raised into the FAB position.
               It owns its own trigger + foldout panel, so we just elevate it. -->
          <div v-else class="-mt-7">
            <DiceRoller class="dm-nav-dice" />
          </div>
        </div>

        <!-- More — also doubles as the "you are somewhere only the sheet can
             reach" indicator, so it stays lit whenever no shown tab is active. -->
        <button
          v-else-if="slot.kind === 'more'"
          type="button"
          class="flex flex-col items-center gap-0.5 py-1.5 transition-colors md:w-22 md:shrink-0"
          :class="moreActive ? 'text-primary' : 'text-muted-foreground'"
          @click="moreOpen = true"
        >
          <span class="relative flex h-6 w-6 items-center justify-center">
            <span
              v-if="moreActive"
              class="absolute -inset-x-3 -inset-y-0.75 rounded-full bg-primary/15"
            />
            <IconMore class="relative h-[1.45rem] w-[1.45rem]" />
          </span>
          <span class="font-cinzel text-2xs leading-none">More</span>
        </button>

        <!-- Primary tab -->
        <button
          v-else
          type="button"
          class="flex flex-col items-center gap-0.5 py-1.5 transition-colors md:w-22 md:shrink-0"
          :class="
            isActive(slot.tab.to) ? 'text-primary' : 'text-muted-foreground'
          "
          @click="go(slot.tab.to)"
        >
          <span class="relative flex h-6 w-6 items-center justify-center">
            <span
              v-if="isActive(slot.tab.to)"
              class="absolute -inset-x-3 -inset-y-0.75 rounded-full bg-primary/15"
            />
            <component
              :is="slot.tab.icon"
              class="relative h-[1.45rem] w-[1.45rem]"
            />
          </span>
          <span class="font-cinzel text-2xs leading-none">{{
            slot.tab.label
          }}</span>
        </button>
      </template>
    </div>
  </nav>

  <!-- More sheet — every section, grouped, with the Prep/Play toggle + a
       context-aware "New …" action (the only create path in Play mode). -->
  <DmNavMoreSheet
    v-if="isDm"
    v-model:open="moreOpen"
    :bar-routes="barRoutes"
    :create="currentCreate"
  />
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  IconNavNpcs,
  IconNavAtlas,
  IconNavItemVault,
  IconNavQuests,
  IconNavDashboard,
  IconNavEncounters,
  IconNavParty,
  IconNavFactions,
  IconNavPantheon,
  IconNavBestiary,
  IconNavSpellbook,
  IconNavNotes,
  IconNavCalendar,
  IconNavSoundboard,
  IconMore,
  IconAdd,
} from "@/lib/icons";
import type { Component } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useAbove } from "@/composables/useBreakpoint";
import DiceRoller from "@/components/common/DiceRoller.vue";
import DmNavMoreSheet from "./DmNavMoreSheet.vue";

interface BarTab {
  to: string;
  label: string;
  icon: Component;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();

const isDm = computed(() => auth.currentRole === "dm");

const moreOpen = ref(false);

// Mode-aware primary-tab pools — mapped to the real nav registry routes,
// ordered by session-importance. Rule-gated sections (Workshop, Interlude,
// Simulacrum) are deliberately excluded — the bar never checks campaign
// rules. Phones (no md breakpoint) show only the first 3; wider bar-mode
// viewports (tablets) reveal more of the pool — see visibleTabCount.
const PREP_TABS: BarTab[] = [
  { to: "/npcs", label: "NPCs", icon: IconNavNpcs },
  { to: "/locations", label: "Atlas", icon: IconNavAtlas },
  { to: "/vault", label: "Items", icon: IconNavItemVault },
  { to: "/quests", label: "Quests", icon: IconNavQuests },
  { to: "/encounters", label: "Encounters", icon: IconNavEncounters },
  { to: "/factions", label: "Factions", icon: IconNavFactions },
  { to: "/deities", label: "Pantheon", icon: IconNavPantheon },
  { to: "/monsters", label: "Bestiary", icon: IconNavBestiary },
  { to: "/spells", label: "Spellbook", icon: IconNavSpellbook },
  { to: "/notes", label: "Notes", icon: IconNavNotes },
];
const PLAY_TABS: BarTab[] = [
  { to: "/dashboard", label: "Dashboard", icon: IconNavDashboard },
  { to: "/encounters", label: "Encounters", icon: IconNavEncounters },
  { to: "/npcs", label: "NPCs", icon: IconNavNpcs },
  { to: "/party", label: "Party", icon: IconNavParty },
  { to: "/quests", label: "Quests", icon: IconNavQuests },
  { to: "/soundboard", label: "Soundboard", icon: IconNavSoundboard },
  { to: "/notes", label: "Notes", icon: IconNavNotes },
  { to: "/locations", label: "Atlas", icon: IconNavAtlas },
  { to: "/calendar", label: "Calendar", icon: IconNavCalendar },
  { to: "/vault", label: "Items", icon: IconNavItemVault },
];

const tabs = computed(() => (ui.dmMode === "play" ? PLAY_TABS : PREP_TABS));

// Bar-mode viewport width decides how much of the pool actually shows: 8
// slots (6 tabs + FAB + More) fit at md (768), 10 at lg (1024), 12 at xl
// (1280). Below md (a phone) only the first 3 tabs show, as before.
const mdUp = useAbove("md");
const lgUp = useAbove("lg");
const xlUp = useAbove("xl");
const visibleTabCount = computed(() => (xlUp.value ? 10 : lgUp.value ? 8 : mdUp.value ? 6 : 3));
const visibleTabs = computed(() => tabs.value.slice(0, visibleTabCount.value));

// The More-sheet gold dot marks only tabs actually visible on the bar.
const barRoutes = computed(() => visibleTabs.value.map((t) => t.to));

// The visible tabs split evenly around the center action: the first half
// sits left of the FAB, the rest sits right of it, then More closes the bar.
// At V=3 (phone) this reproduces the original fixed layout exactly: 2 tabs +
// center + 1 tab + More.
type Slot =
  | { kind: "tab"; key: string; tab: BarTab }
  | { kind: "fab"; key: "fab" }
  | { kind: "more"; key: "more" };

const barSlots = computed<Slot[]>(() => {
  const t = visibleTabs.value;
  const firstHalfCount = Math.ceil(t.length / 2);
  const slots: Slot[] = t
    .slice(0, firstHalfCount)
    .map((tab, i) => ({ kind: "tab", key: tab.to + "-" + i, tab }));
  slots.push({ kind: "fab", key: "fab" });
  t.slice(firstHalfCount).forEach((tab, i) => {
    slots.push({ kind: "tab", key: tab.to + "-" + (firstHalfCount + i), tab });
  });
  slots.push({ kind: "more", key: "more" });
  return slots;
});

// env() safe-area can't live in a Tailwind class, so the bar padding is a style.
const barStyle = {
  paddingTop: "0.375rem",
  paddingBottom: "calc(0.375rem + env(safe-area-inset-bottom))",
} as const;

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + "/");
}

// Whether any tab actually shown in the bar is active. When false, the
// current route only lives in the More sheet, so More itself must read
// active — otherwise sheet-only sections (e.g. /soundboard) light up nothing.
const shownTabActive = computed(() =>
  barSlots.value.some((s) => s.kind === "tab" && isActive(s.tab.to)),
);
const moreActive = computed(() => moreOpen.value || !shownTabActive.value);

function go(to: string) {
  if (!isActive(to)) router.push(to);
}

// Context-aware create: derive the create route + label from the current
// section prefix. Drives the Prep "+" FAB AND the "New …" action in the More
// sheet — the latter is how Play mode (whose center FAB is the dice roller, not
// "+") still reaches create. Sections without a create route fall back to the
// More grid.
interface CreateAction {
  /** Route to push — the common case. */
  to?: string;
  /** Or an action to run — for sections whose "create" is a dialog, not a page. */
  act?: () => void;
  label: string;
}
const CREATE_ACTIONS: Record<string, CreateAction> = {
  "/npcs": { to: "/npcs/new", label: "New NPC" },
  "/locations": { to: "/locations/new", label: "New Location" },
  "/vault": { to: "/vault/new", label: "New Item" },
  "/quests": { to: "/quests/new", label: "New Quest" },
  "/factions": { to: "/factions/new", label: "New Faction" },
  "/spells": { to: "/spells/new", label: "New Spell" },
  "/monsters": { to: "/monsters/new", label: "New Monster" },
  "/deities": { to: "/deities/new", label: "New Deity" },
  // Adding a sound is a dialog, not a route, so the FAB signals the view.
  "/soundboard": { act: () => { ui.soundboardCreateSignal++; }, label: "Create" },
};

const currentCreate = computed<CreateAction | null>(() => {
  const prefix = Object.keys(CREATE_ACTIONS).find(
    (p) => route.path === p || route.path.startsWith(p + "/"),
  );
  if (!prefix) return null;
  const action = CREATE_ACTIONS[prefix];
  // The soundboard's create depends on which peer is showing.
  if (prefix === "/soundboard") {
    const label =
      ui.soundboardViewMode === "scenes"
        ? "New Scene"
        : ui.soundboardViewMode === "playlists"
          ? "New Playlist"
          : "New Sound";
    return { ...action, label };
  }
  return action;
});

function onCreate() {
  const action = currentCreate.value;
  if (action?.act) {
    action.act();
  } else if (action?.to) {
    router.push(action.to);
  } else {
    // No create action for this section — surface the full grid instead.
    moreOpen.value = true;
  }
}
</script>

<style scoped>
@reference "@/assets/main.css";

/* Restyle the reused DiceRoller trigger into the raised gold center FAB so it
   reads as the bar's primary action without duplicating the roller's logic. */
.dm-nav-dice :deep(.dice-trigger) {
  @apply h-14 w-14 rounded-full border-[0.1875rem] border-card bg-primary text-primary-foreground shadow-lg;
}
.dm-nav-dice :deep(.dice-trigger.is-open) {
  @apply bg-primary text-primary-foreground border-card;
}
.dm-nav-dice :deep(.dice-trigger svg) {
  @apply h-6 w-6;
}
/* The roller's foldout defaults to an absolute, right-anchored w-72 panel.
   Anchored to the centered FAB that runs off-screen on a phone, so dock it as a
   full-width foldout above the bar instead (matching the More sheet's feel).
   This block applies whenever the bar is showing (barnav — touch devices and
   narrow windows), not just on phones; the media query below narrows it back
   down for tablet-width barnav viewports. */
.dm-nav-dice :deep(.dice-panel) {
  position: fixed;
  left: 0.75rem;
  right: 0.75rem;
  bottom: calc(4.5rem + env(safe-area-inset-bottom));
  top: auto;
  width: auto;
  margin: 0;
  max-height: calc(100dvh - 9rem);
  overflow-y: auto;
}

/* A full-bleed foldout is right on a phone but wrong on a 1366px tablet —
   center a fixed-width panel above the FAB instead. */
@media (width >= 48rem) {
  .dm-nav-dice :deep(.dice-panel) {
    left: 50%;
    right: auto;
    width: 24rem;
    transform: translateX(-50%);
  }
}
</style>
