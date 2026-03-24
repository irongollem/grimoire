<template>
  <div>
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <EmptyState
      v-else-if="!filtered.length && !props.search && props.statusFilter === 'all' && props.relFilter === 'all' && !props.locationFilter"
      title="No NPCs yet"
      description="Populate your realm with merchants, villains, sages, and more."
    >
      <template #action>
        <RouterLink
          to="/npcs/new"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-sm font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
        >
          Add your first NPC
        </RouterLink>
      </template>
    </EmptyState>

    <p
      v-else-if="!filtered.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No NPCs match your filters.
    </p>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      <RouterLink
        v-for="npc in filtered"
        :key="npc.id"
        :to="`/npcs/${npc.id}`"
        class="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/50 transition-colors overflow-hidden"
      >
        <!-- Thumbnail (landscape) -->
        <div class="relative h-36 bg-muted overflow-hidden shrink-0">
          <FocalImage
            v-if="npc.portrait_url"
            :src="npc.portrait_url"
            :alt="npc.name"
            format="landscape"
            :focal-point="npc.portrait_focal_point"
            class="group-hover:scale-105 transition-transform duration-300"
          />
          <div
            v-else
            class="w-full h-full flex items-center justify-center text-3xl font-cinzel font-bold"
            :style="{
              backgroundColor: relColor(npc.relationship) + '22',
              color: relColor(npc.relationship),
            }"
          >
            {{ initials(npc.name) }}
          </div>
          <span
            class="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-cinzel font-bold tracking-wider uppercase text-white"
            :style="{ backgroundColor: relColor(npc.relationship) + 'EE' }"
          >
            {{ npc.relationship }}
          </span>
        </div>

        <!-- Info -->
        <div class="p-3 flex flex-col gap-1 flex-1">
          <div class="flex items-start justify-between gap-1">
            <h3
              class="font-cinzel text-sm font-bold text-foreground leading-tight line-clamp-1 flex-1"
            >
              {{ npc.name }}
            </h3>
            <span
              :title="npc.status"
              class="w-2 h-2 rounded-full shrink-0 mt-1.5"
              :style="{ backgroundColor: statusColor(npc.status) }"
            />
          </div>

          <p
            v-if="npc.race || npc.class"
            class="font-fell text-xs text-muted-foreground italic truncate"
          >
            {{ [npc.race, npc.class].filter(Boolean).join(" · ") }}
          </p>

          <p v-if="npc.occupation" class="font-fell text-xs text-muted-foreground truncate">
            {{ npc.occupation }}
          </p>

          <p v-if="npc.location_id" class="font-fell text-xs text-muted-foreground truncate">
            📍 {{ locationName(npc.location_id) }}
          </p>

          <div v-if="npc.tags.length" class="flex flex-wrap gap-1 mt-auto pt-1">
            <span
              v-for="tag in npc.tags.slice(0, 3)"
              :key="tag"
              class="px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground tracking-wider"
            >
              {{ tag }}
            </span>
            <span
              v-if="npc.tags.length > 3"
              class="font-fell text-[10px] text-muted-foreground italic self-center"
            >
              +{{ npc.tags.length - 3 }}
            </span>
          </div>
        </div>
      </RouterLink>
    </div>

    <p
      v-if="filtered.length"
      class="mt-4 font-fell text-xs text-muted-foreground italic text-right"
    >
      {{ filtered.length }} of {{ npcs?.length ?? 0 }} NPCs
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useNpcs } from "@/composables/useNpcs";
import { useAllLocations, useLocationTree } from "@/composables/useLocations";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import type { NpcRelationship, NpcStatus } from "@/types/npc.types";

const props = defineProps<{
  search: string;
  statusFilter: string;
  relFilter: string;
  locationFilter: string;
  sortBy: "name" | "location";
}>();

const { data: npcs, isLoading } = useNpcs();
const { data: allLocations } = useAllLocations();
const { locationOptions, getDescendantIds } = useLocationTree();

const locationMap = computed(() => {
  const m = new Map<string, string>();
  for (const loc of allLocations.value ?? []) m.set(loc.id, loc.name);
  return m;
});

const locationOrder = computed(() => {
  const m = new Map<string, number>();
  locationOptions.value.forEach((loc, i) => m.set(loc.id, i));
  return m;
});

function locationName(id: string) {
  return locationMap.value.get(id) ?? "Unknown";
}

const filtered = computed(() => {
  let list = npcs.value ?? [];
  if (props.search.trim()) {
    const q = props.search.toLowerCase();
    list = list.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        n.race?.toLowerCase().includes(q) ||
        n.occupation?.toLowerCase().includes(q) ||
        (n.location_id ? locationMap.value.get(n.location_id)?.toLowerCase().includes(q) : false) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }
  if (props.statusFilter !== "all") list = list.filter((n) => n.status === props.statusFilter);
  if (props.relFilter !== "all") list = list.filter((n) => n.relationship === props.relFilter);
  if (props.locationFilter) {
    const locationIds = getDescendantIds(props.locationFilter);
    list = list.filter((n) => n.location_id && locationIds.has(n.location_id));
  }
  if (props.sortBy === "location") {
    const order = locationOrder.value;
    list = [...list].sort((a, b) => {
      const ai = a.location_id ? (order.get(a.location_id) ?? Infinity) : Infinity;
      const bi = b.location_id ? (order.get(b.location_id) ?? Infinity) : Infinity;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
  } else {
    list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  }
  return list;
});

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const REL_COLORS: Record<NpcRelationship, string> = {
  ally: "#2563eb",
  neutral: "#6b7280",
  enemy: "#dc2626",
  unknown: "#9333ea",
};
const STATUS_COLORS: Record<NpcStatus, string> = {
  alive: "#22c55e",
  dead: "#ef4444",
  missing: "#f59e0b",
  unknown: "#6b7280",
};
function relColor(rel: NpcRelationship) {
  return REL_COLORS[rel] ?? "#6b7280";
}
function statusColor(s: NpcStatus) {
  return STATUS_COLORS[s] ?? "#6b7280";
}
</script>
