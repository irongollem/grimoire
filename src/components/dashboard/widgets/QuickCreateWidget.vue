<template>
  <DashboardWidget title="Quick create">
    <div class="flex flex-wrap gap-1.5 p-3">
      <AppButton
        v-for="target in QUICK_CREATE_TARGETS"
        :key="target.to"
        :to="target.to"
        variant="subtle"
        surface="card"
        size="xs"
        :icon="target.icon"
        :label="target.label"
      />
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * The five things a DM starts from a standing start (#764).
 *
 * Deliberately links rather than opening anything: every one of these routes
 * already knows how to be a blank editor, and a widget that grew its own
 * create dialogs would be five more forms to keep in step with five real ones.
 * The dashboard's job here is to shorten the path, not to own the act.
 *
 * The icons come from the nav glyph set, so a button and the sidebar entry it
 * leads to are the same mark — the point being that this is a shortcut to a
 * place the DM already knows, not a new place.
 */
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import AppButton from "@/components/common/AppButton.vue";
import {
  IconNavNpcs,
  IconNavQuests,
  IconNavNotes,
  IconNavEncounters,
  IconNavAtlas,
} from "@/lib/icons";

const QUICK_CREATE_TARGETS = [
  { to: "/npcs/new", label: "NPC", icon: IconNavNpcs },
  { to: "/quests/new", label: "Quest", icon: IconNavQuests },
  { to: "/notes/new", label: "Note", icon: IconNavNotes },
  { to: "/encounters/new", label: "Encounter", icon: IconNavEncounters },
  // `/locations/new`, not `/atlas/new` — the nav says Atlas, the route says
  // locations, and it is the route that has to be right.
  { to: "/locations/new", label: "Location", icon: IconNavAtlas },
] as const;
</script>
