<template>
  <div class="flex flex-col gap-4">
    <!-- Linked Encounters -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">
          Linked Encounters
          <span v-if="linkedEncounters.length" class="font-fell font-normal">
            ({{ linkedEncounters.length }})
          </span>
        </span>
      </div>
      <div class="p-2 flex flex-col gap-1">
        <div
          v-for="ref in linkedEncounters"
          :key="ref.id"
          class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
        >
          <IconEncounter class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <RouterLink
            :to="`/encounters/${ref.ref_id}`"
            class="text-body text-foreground flex-1 truncate hover:text-primary transition-colors"
          >
            {{ encounterName(ref.ref_id) }}
          </RouterLink>
          <button
            v-if="!isNew"
            type="button"
            :title="ref.is_player_visible ? 'Visible to players' : 'Hidden from players'"
            class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            :class="ref.is_player_visible ? 'text-elven-green' : 'text-muted-foreground/40'"
            @click="$emit('toggle-visibility', ref)"
          >
            <IconReveal v-if="ref.is_player_visible" class="h-3.5 w-3.5" />
            <IconHide v-else class="h-3.5 w-3.5" />
          </button>
          <button
            v-if="!isNew"
            type="button"
            class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
            @click="$emit('remove', ref)"
          >
            <IconClose class="h-3.5 w-3.5" />
          </button>
        </div>
        <div v-if="!isNew && availableEncounters.length" class="flex items-center gap-2 pt-1">
          <EntityCombobox
            v-model="selectedEncounterId"
            :options="availableEncounters"
            placeholder="Link an encounter…"
          />
          <button
            type="button"
            :disabled="!selectedEncounterId"
            class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
            @click="addEncounter"
          >
            <IconAdd class="h-4 w-4" />
          </button>
        </div>
        <p v-else-if="isNew" class="text-caption text-muted-foreground italic px-2 py-1">
          Save the quest first, then link encounters.
        </p>
        <p
          v-else-if="!availableEncounters.length && !linkedEncounters.length"
          class="text-caption text-muted-foreground italic px-2 py-1"
        >
          No encounters yet.
        </p>
      </div>
    </div>

    <!-- Key NPCs -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">
          Key NPCs
          <span v-if="linkedNpcRefs.length" class="font-fell font-normal">
            ({{ linkedNpcRefs.length }})
          </span>
        </span>
      </div>
      <div class="p-2 flex flex-col gap-1">
        <div
          v-for="ref in linkedNpcRefs"
          :key="ref.id"
          class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
        >
          <IconUser class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <RouterLink
            :to="`/npcs/${ref.ref_id}`"
            class="text-body text-foreground flex-1 truncate hover:text-primary transition-colors"
          >
            {{ npcName(ref.ref_id) }}
          </RouterLink>
          <button
            v-if="!isNew"
            type="button"
            :title="ref.is_player_visible ? 'Visible to players' : 'Hidden from players'"
            class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            :class="ref.is_player_visible ? 'text-elven-green' : 'text-muted-foreground/40'"
            @click="$emit('toggle-visibility', ref)"
          >
            <IconReveal v-if="ref.is_player_visible" class="h-3.5 w-3.5" />
            <IconHide v-else class="h-3.5 w-3.5" />
          </button>
          <button
            v-if="!isNew"
            type="button"
            class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
            @click="$emit('remove', ref)"
          >
            <IconClose class="h-3.5 w-3.5" />
          </button>
        </div>
        <div v-if="!isNew && availableNpcs.length" class="flex items-center gap-2 pt-1">
          <EntityCombobox
            v-model="selectedNpcId"
            :options="availableNpcs"
            placeholder="Link an NPC…"
          />
          <button
            type="button"
            :disabled="!selectedNpcId"
            class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
            @click="addNpc"
          >
            <IconAdd class="h-4 w-4" />
          </button>
        </div>
        <p v-else-if="isNew" class="text-caption text-muted-foreground italic px-2 py-1">
          Save the quest first, then link NPCs.
        </p>
        <p
          v-else-if="!availableNpcs.length && !linkedNpcRefs.length"
          class="text-caption text-muted-foreground italic px-2 py-1"
        >
          No NPCs yet.
        </p>
      </div>
    </div>

    <!-- Key Locations -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">
          Key Locations
          <span v-if="linkedLocationRefs.length" class="font-fell font-normal">
            ({{ linkedLocationRefs.length }})
          </span>
        </span>
      </div>
      <div class="p-2 flex flex-col gap-1">
        <div
          v-for="ref in linkedLocationRefs"
          :key="ref.id"
          class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
        >
          <IconLocation class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <RouterLink
            :to="`/atlas/${ref.ref_id}`"
            class="text-body text-foreground flex-1 truncate hover:text-primary transition-colors"
          >
            {{ locationName(ref.ref_id) }}
          </RouterLink>
          <button
            v-if="!isNew"
            type="button"
            :title="ref.is_player_visible ? 'Visible to players' : 'Hidden from players'"
            class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            :class="ref.is_player_visible ? 'text-elven-green' : 'text-muted-foreground/40'"
            @click="$emit('toggle-visibility', ref)"
          >
            <IconReveal v-if="ref.is_player_visible" class="h-3.5 w-3.5" />
            <IconHide v-else class="h-3.5 w-3.5" />
          </button>
          <button
            v-if="!isNew"
            type="button"
            class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
            @click="$emit('remove', ref)"
          >
            <IconClose class="h-3.5 w-3.5" />
          </button>
        </div>
        <div v-if="!isNew && availableLocations.length" class="flex items-center gap-2 pt-1">
          <EntityCombobox
            v-model="selectedLocationId"
            :options="availableLocations"
            placeholder="Link a location…"
          />
          <button
            type="button"
            :disabled="!selectedLocationId"
            class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
            @click="addLocation"
          >
            <IconAdd class="h-4 w-4" />
          </button>
        </div>
        <p v-else-if="isNew" class="text-caption text-muted-foreground italic px-2 py-1">
          Save the quest first, then link locations.
        </p>
        <p
          v-else-if="!availableLocations.length && !linkedLocationRefs.length"
          class="text-caption text-muted-foreground italic px-2 py-1"
        >
          No locations yet.
        </p>
      </div>
    </div>

    <!-- Creatures -->
    <div class="rounded-lg border border-border bg-card overflow-hidden">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">
          Creatures
          <span v-if="linkedMonsterRefs.length" class="font-fell font-normal">
            ({{ linkedMonsterRefs.length }})
          </span>
        </span>
      </div>
      <div class="p-2 flex flex-col gap-1">
        <div
          v-for="ref in linkedMonsterRefs"
          :key="ref.id"
          class="flex items-center gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
        >
          <IconMonster class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <RouterLink
            :to="`/bestiary/${ref.ref_id}`"
            class="text-body text-foreground flex-1 truncate hover:text-primary transition-colors"
          >
            {{ monsterName(ref.ref_id) }}
          </RouterLink>
          <button
            v-if="!isNew"
            type="button"
            :title="ref.is_player_visible ? 'Visible to players' : 'Hidden from players'"
            class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            :class="ref.is_player_visible ? 'text-elven-green' : 'text-muted-foreground/40'"
            @click="$emit('toggle-visibility', ref)"
          >
            <IconReveal v-if="ref.is_player_visible" class="h-3.5 w-3.5" />
            <IconHide v-else class="h-3.5 w-3.5" />
          </button>
          <button
            v-if="!isNew"
            type="button"
            class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
            @click="$emit('remove', ref)"
          >
            <IconClose class="h-3.5 w-3.5" />
          </button>
        </div>
        <div v-if="!isNew && availableMonsters.length" class="flex items-center gap-2 pt-1">
          <EntityCombobox
            v-model="selectedMonsterId"
            :options="availableMonsters"
            placeholder="Link a creature…"
          />
          <button
            type="button"
            :disabled="!selectedMonsterId"
            class="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
            @click="addMonster"
          >
            <IconAdd class="h-4 w-4" />
          </button>
        </div>
        <p v-else-if="isNew" class="text-caption text-muted-foreground italic px-2 py-1">
          Save the quest first, then link creatures.
        </p>
        <p
          v-else-if="!availableMonsters.length && !linkedMonsterRefs.length"
          class="text-caption text-muted-foreground italic px-2 py-1"
        >
          No monsters in the bestiary yet.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { RouterLink } from "vue-router";
import { IconAdd, IconClose, IconEncounter, IconHide, IconLocation, IconMonster, IconReveal, IconUser } from "@/lib/icons";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import type { QuestRef } from "@/types/quest.types";

interface NamedOption {
  id: string;
  name: string;
}

const { allEncounters, allNpcs, allLocations, allMonsters } = defineProps<{
  isNew: boolean;
  linkedEncounters: QuestRef[];
  linkedNpcRefs: QuestRef[];
  linkedLocationRefs: QuestRef[];
  linkedMonsterRefs: QuestRef[];
  availableEncounters: NamedOption[];
  availableNpcs: NamedOption[];
  availableLocations: NamedOption[];
  availableMonsters: NamedOption[];
  allEncounters: NamedOption[];
  allNpcs: NamedOption[];
  allLocations: NamedOption[];
  allMonsters: NamedOption[];
}>();

const emit = defineEmits<{
  "toggle-visibility": [ref: QuestRef];
  remove: [ref: QuestRef];
  add: [type: "encounter" | "npc" | "location" | "monster", refId: string];
}>();

const selectedEncounterId = ref("");
const selectedNpcId = ref("");
const selectedLocationId = ref("");
const selectedMonsterId = ref("");

function encounterName(id: string): string {
  return allEncounters.find((e) => e.id === id)?.name ?? id;
}
function npcName(id: string): string {
  return allNpcs.find((n) => n.id === id)?.name ?? id;
}
function locationName(id: string): string {
  return allLocations.find((l) => l.id === id)?.name ?? id;
}
function monsterName(id: string): string {
  return allMonsters.find((m) => m.id === id)?.name ?? id;
}

function addEncounter() {
  if (!selectedEncounterId.value) return;
  emit("add", "encounter", selectedEncounterId.value);
  selectedEncounterId.value = "";
}
function addNpc() {
  if (!selectedNpcId.value) return;
  emit("add", "npc", selectedNpcId.value);
  selectedNpcId.value = "";
}
function addLocation() {
  if (!selectedLocationId.value) return;
  emit("add", "location", selectedLocationId.value);
  selectedLocationId.value = "";
}
function addMonster() {
  if (!selectedMonsterId.value) return;
  emit("add", "monster", selectedMonsterId.value);
  selectedMonsterId.value = "";
}
</script>
