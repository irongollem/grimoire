<template>
  <div class="space-y-4 pb-8">
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div v-else-if="!resolved.length" class="text-center py-16 space-y-2">
      <p class="font-cinzel text-lg text-muted-foreground">No creatures discovered yet</p>
      <p class="font-fell text-sm text-muted-foreground italic">Monsters you encounter will appear here.</p>
    </div>

    <template v-else>
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="Search bestiary…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <div
          v-for="entry in filtered"
          :key="entry.discovery.id"
          class="group relative rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
          @click="open(entry)"
        >
          <div class="h-1 w-full shrink-0" :style="{ backgroundColor: crColor(entry.monster?.stat_block.challenge_rating ?? '0') }" />
          <div class="flex">
            <!-- Image flush to left/bottom edges -->
            <div class="shrink-0 w-20 bg-muted overflow-hidden">
              <FocalImage
                v-if="entry.discovery.image_url"
                :src="entry.discovery.image_url"
                :alt="entry.discovery.monster_name"
                format="portrait"
                :focal-point="entry.monster?.portrait_focal_point"
                class="group-hover:scale-105 transition-transform duration-300"
              />
              <div
                v-else
                class="w-full h-full flex items-center justify-center font-cinzel text-2xl font-bold"
                :style="{ color: crColor(entry.monster?.stat_block.challenge_rating ?? '0') }"
              >{{ entry.discovery.monster_name.charAt(0) }}</div>
            </div>
            <!-- Text content with padding -->
            <div class="flex flex-col justify-between min-w-0 p-3 flex-1">
              <div>
                <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight">{{ entry.discovery.monster_name }}</h3>
                <p v-if="entry.monster" class="font-fell text-xs text-muted-foreground italic capitalize">
                  {{ entry.monster.size }} {{ entry.monster.monster_type }}
                </p>
              </div>
              <div v-if="entry.monster" class="flex gap-3 font-cinzel text-[11px] text-muted-foreground">
                <template v-if="entry.discovery.reveal_stats">
                  <span><span class="text-foreground font-bold">AC</span> {{ entry.monster.stat_block.armor_class }}</span>
                  <span><span class="text-foreground font-bold">HP</span> {{ entry.monster.stat_block.hit_points }}</span>
                </template>
                <span
                  class="ml-auto px-1.5 py-0.5 rounded font-bold text-white text-[9px]"
                  :style="{ backgroundColor: crColor(entry.monster.stat_block.challenge_rating) }"
                >CR {{ entry.monster.stat_block.challenge_rating }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Detail lightbox -->
    <Teleport to="body">
      <div
        v-if="selected"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        @click.self="selected = null"
      >
        <div class="relative bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <button class="absolute top-3 right-3 z-10 text-muted-foreground hover:text-foreground" @click="selected = null">
            <X class="h-4 w-4" />
          </button>

          <div class="relative h-48 bg-muted overflow-hidden rounded-t-xl">
            <FocalImage
              v-if="selected.discovery.image_url"
              :src="selected.discovery.image_url"
              :alt="selected.discovery.monster_name"
              format="landscape"
              :focal-point="selected.monster?.portrait_focal_point"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center font-cinzel text-5xl font-bold"
              :style="{ color: crColor(selected.monster?.stat_block.challenge_rating ?? '0') }"
            >{{ selected.discovery.monster_name.charAt(0) }}</div>
            <span
              v-if="selected.monster"
              class="absolute bottom-2 right-2 px-2 py-0.5 rounded font-cinzel text-[10px] font-bold text-white"
              :style="{ backgroundColor: crColor(selected.monster.stat_block.challenge_rating) }"
            >CR {{ selected.monster.stat_block.challenge_rating }}</span>
          </div>

          <div class="p-4 space-y-4">
            <div>
              <h2 class="font-cinzel text-xl font-bold text-foreground">{{ selected.discovery.monster_name }}</h2>
              <p v-if="selected.monster" class="font-fell text-sm text-muted-foreground italic capitalize">
                {{ selected.monster.size }} {{ selected.monster.monster_type }}<span v-if="selected.monster.alignment"> · {{ selected.monster.alignment }}</span>
              </p>
            </div>

            <template v-if="selected.monster && selected.discovery.reveal_stats">
              <div class="flex gap-4 font-cinzel text-sm">
                <div class="text-center">
                  <p class="text-[9px] text-muted-foreground tracking-wider">AC</p>
                  <p class="font-bold">{{ selected.monster.stat_block.armor_class }}</p>
                </div>
                <div class="text-center">
                  <p class="text-[9px] text-muted-foreground tracking-wider">HP</p>
                  <p class="font-bold">{{ selected.monster.stat_block.hit_points }}</p>
                </div>
                <div class="text-center">
                  <p class="text-[9px] text-muted-foreground tracking-wider">SPD</p>
                  <p class="font-bold">{{ selected.monster.stat_block.speed }}</p>
                </div>
              </div>
              <AbilityScoreTable :scores="selectedScores" :rounded="false" />
            </template>

            <!-- Player notes: "How to defeat them", lore, weaknesses -->
            <PlayerNotesWidget
              entity-type="monster"
              :entity-id="selected.discovery.monster_id ?? selected.discovery.srd_slug ?? selected.discovery.id"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Search, X } from "lucide-vue-next";
import { usePlayerDiscoveries } from "@/composables/useDiscoveredMonsters";
import { useAllMonsters } from "@/composables/useMonsters";
import { useUiStore } from "@/stores/ui";
import type { DiscoveredMonster, Monster } from "@/types/monster.types";
import FocalImage from "@/components/common/FocalImage.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";

interface BestiaryEntry { discovery: DiscoveredMonster; monster: Monster | null }

const ui = useUiStore();
const { data: discoveries, isLoading } = usePlayerDiscoveries();
const { data: allMonsters } = useAllMonsters();

/** In DM preview mode the DM has full RLS access, so filter client-side to
 *  only show what the selected party member can actually see. */
function isVisibleToPreviewMember(d: DiscoveredMonster): boolean {
  if (!ui.dmPreviewMode || !ui.dmPreviewPartyMemberId) return true;
  return d.visible_to === null || d.visible_to.includes(ui.dmPreviewPartyMemberId);
}

/** Resolve each discovery to its full Monster record (SRD or custom). */
const resolved = computed<BestiaryEntry[]>(() => {
  return (discoveries.value ?? []).filter(isVisibleToPreviewMember).map((d) => {
    let monster: Monster | null = null;
    if (allMonsters.value) {
      if (d.srd_slug)    monster = allMonsters.value.find((m) => m.id === d.srd_slug) ?? null;
      else if (d.monster_id) monster = allMonsters.value.find((m) => m.id === d.monster_id) ?? null;
    }
    return { discovery: d, monster };
  });
});

const search = ref("");
const selected = ref<BestiaryEntry | null>(null);

const filtered = computed(() => {
  if (!search.value.trim()) return resolved.value;
  const q = search.value.toLowerCase();
  return resolved.value.filter(
    (e) =>
      e.discovery.monster_name.toLowerCase().includes(q) ||
      e.monster?.monster_type.toLowerCase().includes(q),
  );
});

const selectedScores = computed(() => {
  const s = selected.value?.monster?.stat_block;
  return { str: s?.str ?? 10, dex: s?.dex ?? 10, con: s?.con ?? 10, int: s?.int ?? 10, wis: s?.wis ?? 10, cha: s?.cha ?? 10 };
});

function open(entry: BestiaryEntry) { selected.value = entry; }

function parseFraction(s: string): number {
  const [a, b] = s.split("/");
  return parseFloat(a) / parseFloat(b);
}
function crColor(cr: string): string {
  const n = cr === "0" ? 0 : cr.includes("/") ? parseFraction(cr) : parseFloat(cr);
  if (n <= 0.5) return "#22c55e";
  if (n <= 4)   return "#eab308";
  if (n <= 9)   return "#f97316";
  if (n <= 15)  return "#dc2626";
  return "#7c3aed";
}
</script>
