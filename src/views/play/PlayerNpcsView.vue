<template>
  <div>
    <h1 class="font-cinzel text-xl font-bold text-foreground mb-1">People</h1>
    <p class="font-fell text-sm text-muted-foreground italic mb-4">Characters the party has encountered.</p>

    <!-- Search + filters -->
    <div class="flex flex-wrap items-center gap-2 mb-5">
      <div class="relative flex-1 min-w-40">
        <SearchIcon class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider">
        <button
          v-for="opt in REL_FILTER_OPTIONS"
          :key="opt.value"
          class="px-2.5 py-1.5 transition-colors"
          :class="relFilter === opt.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
          @click="relFilter = opt.value"
        >{{ opt.label }}</button>
      </div>
    </div>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <p
      v-else-if="!filtered.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      {{ npcs?.length ? 'No NPCs match your search.' : 'No NPCs have been revealed yet.' }}
    </p>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      <PlayerNpcCard
        v-for="npc in filtered"
        :key="npc.id"
        :npc="npc"
        @click="openNpc(npc)"
      />
    </div>

    <!-- Detail lightbox -->
    <Transition name="fade">
      <div
        v-if="selected"
        class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        @click.self="closeNpc"
      >
        <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <!-- Portrait blown up -->
          <div class="relative shrink-0">
            <div
              v-if="selected.player_visible_fields.includes('portrait') && selected.portrait_url"
              class="w-full h-72 overflow-hidden"
            >
              <FocalImage
                :src="selected.portrait_url"
                :alt="selected.player_visible_fields.includes('name') ? selected.name : '???'"
                format="portrait"
                :focal-point="selected.portrait_focal_point"
              />
            </div>
            <div
              v-else-if="!selected.player_visible_fields.includes('portrait') && selected.portrait_url"
              class="w-full h-72 overflow-hidden"
            >
              <img
                src="/assets/npcs/mystery-figure.png"
                alt="Identity hidden"
                class="w-full h-full object-cover object-top"
              />
            </div>
            <button
              class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors"
              @click="closeNpc"
            >
              <XIcon class="h-4 w-4" />
            </button>
          </div>

          <div class="p-4 overflow-y-auto space-y-4">
            <!-- Identity -->
            <div>
              <div class="flex items-start justify-between gap-3">
                <h2 class="font-cinzel text-lg font-bold text-foreground">
                  {{ selected.player_visible_fields.includes('name') ? selected.name : '???' }}
                </h2>
                <!-- Relevance stars in detail view -->
                <div class="flex items-center gap-0.5 shrink-0 pt-1">
                  <button
                    v-for="n in [1,2,3,4,5]"
                    :key="n"
                    type="button"
                    class="text-lg leading-none transition-colors"
                    :class="n <= selectedRating ? 'text-yellow-400' : 'text-muted-foreground/25 hover:text-yellow-400/60'"
                    :title="n === 1 ? 'Not relevant' : n === 5 ? 'Very relevant' : `Relevance ${n}`"
                    @click="setRating(selected.id, n)"
                  >★</button>
                </div>
              </div>
              <div class="flex flex-wrap gap-2 mt-1">
                <span
                  v-if="selected.player_visible_fields.includes('relationship')"
                  class="px-2 py-0.5 rounded text-[11px] font-cinzel font-bold tracking-wider uppercase text-white"
                  :style="{ backgroundColor: relColor(selected.relationship) + 'CC' }"
                >
                  {{ selected.relationship }}
                </span>
                <span
                  v-if="selected.player_visible_fields.includes('status')"
                  class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted font-cinzel text-[11px] tracking-wider"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: statusColor(selected.status) }" />
                  {{ selected.status }}
                </span>
              </div>
              <p
                v-if="selected.player_visible_fields.includes('race') && selected.race"
                class="mt-1 font-fell text-sm text-muted-foreground italic"
              >
                {{ selected.race }}
              </p>
              <p
                v-if="selected.player_visible_fields.includes('occupation') && selected.occupation"
                class="font-fell text-sm text-muted-foreground"
              >
                {{ selected.occupation }}
              </p>
            </div>

            <!-- Player notes (private + shared) -->
            <PlayerNotesWidget entity-type="npc" :entity-id="selected.id" placeholder="Your observations about this character…" />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { XIcon, SearchIcon } from "lucide-vue-next";
import { useSharedNpcs } from "@/composables/useNpcs";
import { usePlayerNpcRatings } from "@/composables/usePlayerNpcRatings";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";

import PlayerNpcCard from "@/components/play/PlayerNpcCard.vue";
import type { Npc, NpcRelationship, NpcStatus } from "@/types/npc.types";

const REL_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "ally", label: "Ally" },
  { value: "neutral", label: "Neutral" },
  { value: "enemy", label: "Enemy" },
];

const { data: npcs, isLoading } = useSharedNpcs();
const { getRating, setRating, ratingTick } = usePlayerNpcRatings(() => npcs.value ?? []);

const search = ref("");
const relFilter = ref("all");
const selected = ref<Npc | null>(null);

const selectedRating = computed(() => {
  void ratingTick.value;
  return selected.value ? getRating(selected.value.id) : 0;
});

const filtered = computed(() => {
  void ratingTick.value;
  let list = [...(npcs.value ?? [])];
  if (search.value.trim()) {
    const q = search.value.toLowerCase();
    list = list.filter((n) => {
      const name = n.player_visible_fields.includes("name") ? n.name.toLowerCase() : "";
      const occ  = n.player_visible_fields.includes("occupation") ? (n.occupation?.toLowerCase() ?? "") : "";
      const race = n.player_visible_fields.includes("race") ? (n.race?.toLowerCase() ?? "") : "";
      return name.includes(q) || occ.includes(q) || race.includes(q);
    });
  }
  if (relFilter.value !== "all") {
    list = list.filter((n) => n.player_visible_fields.includes("relationship") && n.relationship === relFilter.value);
  }
  list.sort((a, b) => {
    const ra = getRating(a.id);
    const rb = getRating(b.id);
    if (ra !== rb) return rb - ra;
    return a.name.localeCompare(b.name);
  });
  return list;
});

function openNpc(npc: Npc) { selected.value = npc; }
function closeNpc() { selected.value = null; }

const REL_COLORS: Record<NpcRelationship, string> = {
  ally: "#2563eb", neutral: "#6b7280", enemy: "#dc2626", unknown: "#9333ea",
};
const STATUS_COLORS: Record<NpcStatus, string> = {
  alive: "#22c55e", dead: "#ef4444", missing: "#f59e0b", unknown: "#6b7280",
};
function relColor(rel: NpcRelationship) { return REL_COLORS[rel] ?? "#6b7280"; }
function statusColor(s: NpcStatus) { return STATUS_COLORS[s] ?? "#6b7280"; }
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
