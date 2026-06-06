<template>
  <!-- Docked, mode-aware bottom navigation. Mobile only — desktop keeps the
       left sidebar. Only DMs see it; players have their own portal nav. -->
  <nav
    v-if="isDm"
    class="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 items-end border-t border-border bg-card px-1.5 md:hidden"
    :style="barStyle"
  >
    <template v-for="slot in barSlots" :key="slot.key">
      <!-- Center action: Prep = create FAB, Play = dice roller -->
      <div v-if="slot.kind === 'fab'" class="flex justify-center">
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

      <!-- More -->
      <button
        v-else-if="slot.kind === 'more'"
        type="button"
        class="flex flex-col items-center gap-0.5 py-1.5 transition-colors"
        :class="moreOpen ? 'text-primary' : 'text-muted-foreground'"
        @click="moreOpen = true"
      >
        <span class="flex h-6 w-6 items-center justify-center">
          <IconMore class="h-[1.45rem] w-[1.45rem]" />
        </span>
        <span class="font-cinzel text-2xs leading-none">More</span>
      </button>

      <!-- Primary tab -->
      <button
        v-else
        type="button"
        class="flex flex-col items-center gap-0.5 py-1.5 transition-colors"
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
  IconParty,
  IconLocation,
  IconPackage,
  IconQuest,
  IconDashboard,
  IconEncounter,
  IconShield,
  IconMore,
  IconAdd,
} from "@/lib/icons";
import type { Component } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
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

// Mode-aware primary tabs — mapped to the real nav registry routes.
// Prep: NPCs · Atlas (Locations) · Item Vault (Items) · Quests
// Play: Dashboard · Encounters · NPCs · Party
const PREP_TABS: BarTab[] = [
  { to: "/npcs", label: "NPCs", icon: IconParty },
  { to: "/locations", label: "Atlas", icon: IconLocation },
  { to: "/vault", label: "Items", icon: IconPackage },
  { to: "/quests", label: "Quests", icon: IconQuest },
];
const PLAY_TABS: BarTab[] = [
  { to: "/dashboard", label: "Dashboard", icon: IconDashboard },
  { to: "/encounters", label: "Encounters", icon: IconEncounter },
  { to: "/npcs", label: "NPCs", icon: IconParty },
  { to: "/party", label: "Party", icon: IconShield },
];

const tabs = computed(() => (ui.dmMode === "play" ? PLAY_TABS : PREP_TABS));
const barRoutes = computed(() => tabs.value.map((t) => t.to));

// With the center action on (default), balance 2 tabs + center + 1 tab + More.
// The 4th primary tab lives in the More sheet so the bar stays even.
type Slot =
  | { kind: "tab"; key: string; tab: BarTab }
  | { kind: "fab"; key: "fab" }
  | { kind: "more"; key: "more" };

const barSlots = computed<Slot[]>(() => {
  const t = tabs.value;
  return [
    { kind: "tab", key: t[0].to + "-0", tab: t[0] },
    { kind: "tab", key: t[1].to + "-1", tab: t[1] },
    { kind: "fab", key: "fab" },
    { kind: "tab", key: t[2].to + "-2", tab: t[2] },
    { kind: "more", key: "more" },
  ];
});

// env() safe-area can't live in a Tailwind class, so the bar padding is a style.
const barStyle = {
  paddingTop: "0.375rem",
  paddingBottom: "calc(0.375rem + env(safe-area-inset-bottom))",
} as const;

function isActive(to: string): boolean {
  return route.path === to || route.path.startsWith(to + "/");
}

function go(to: string) {
  if (!isActive(to)) router.push(to);
}

// Context-aware create: derive the create route + label from the current
// section prefix. Drives the Prep "+" FAB AND the "New …" action in the More
// sheet — the latter is how Play mode (whose center FAB is the dice roller, not
// "+") still reaches create. Sections without a create route fall back to the
// More grid.
interface CreateAction {
  to: string;
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
};

const currentCreate = computed<CreateAction | null>(() => {
  const prefix = Object.keys(CREATE_ACTIONS).find(
    (p) => route.path === p || route.path.startsWith(p + "/"),
  );
  return prefix ? CREATE_ACTIONS[prefix] : null;
});

function onCreate() {
  if (currentCreate.value) {
    router.push(currentCreate.value.to);
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
   This block only ever applies on mobile — the whole nav is md:hidden. */
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
</style>
