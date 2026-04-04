<template>
  <div>
    <h1 class="font-cinzel text-xl font-bold text-foreground mb-1">Factions</h1>
    <p class="font-fell text-sm text-muted-foreground italic mb-6">Organizations and powers at play in the world.</p>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <p
      v-else-if="!factions?.length"
      class="text-center font-fell text-sm text-muted-foreground italic py-12"
    >
      No factions have been revealed yet.
    </p>

    <div v-else class="flex flex-col gap-3">
      <!-- Filter bar -->
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="search"
          type="search"
          placeholder="Filter factions…"
          class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <p v-if="!filtered.length" class="font-fell text-sm text-muted-foreground italic text-center py-6">
        No factions match your filter.
      </p>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="faction in filtered"
          :key="faction.id"
          class="rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
          @click="open(faction)"
        >
          <div class="flex items-center gap-3 p-3">
            <!-- Emblem -->
            <div class="h-12 w-12 shrink-0 rounded-md border border-border bg-muted overflow-hidden">
              <img v-if="faction.emblem_url" :src="faction.emblem_url" alt="" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
                <Shield class="h-6 w-6" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-cinzel text-sm font-bold text-foreground truncate">{{ faction.name }}</h3>
              <p v-if="faction.faction_type" class="font-fell text-xs text-muted-foreground italic">{{ faction.faction_type }}</p>
              <div v-if="faction.tags?.length" class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="tag in faction.tags.slice(0, 3)"
                  :key="tag"
                  class="inline-block bg-muted rounded px-1.5 py-0.5 font-cinzel text-[9px] tracking-wider text-muted-foreground"
                >{{ tag }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Detail panel -->
    <Transition name="fade">
      <div
        v-if="selected"
        class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        @click.self="close"
      >
        <div class="bg-card rounded-xl border border-border w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <!-- Header -->
          <div class="flex items-center gap-3 p-4 border-b border-border shrink-0">
            <div class="h-14 w-14 shrink-0 rounded-md border border-border bg-muted overflow-hidden">
              <img v-if="selected.emblem_url" :src="selected.emblem_url" alt="" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
                <Shield class="h-7 w-7" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="font-cinzel text-base font-bold text-foreground">{{ selected.name }}</h2>
              <p v-if="selected.faction_type || selected.alignment" class="font-fell text-xs text-muted-foreground italic">
                {{ [selected.faction_type, selected.alignment].filter(Boolean).join(' · ') }}
              </p>
            </div>
            <button class="shrink-0 text-muted-foreground hover:text-foreground transition-colors" @click="close">
              <XIcon class="h-4 w-4" />
            </button>
          </div>

          <div class="p-4 overflow-y-auto space-y-4">
            <!-- Description -->
            <div v-if="selected.description">
              <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">ABOUT</p>
              <RichTextViewer :content="selected.description" />
            </div>

            <!-- Fellow faction members (only visible if the player is also in this faction) -->
            <div v-if="playerMembership && factionNpcs?.length">
              <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">
                KNOWN MEMBERS
                <span class="font-fell font-normal normal-case italic ml-1">({{ playerMembership.role ?? 'Member' }})</span>
              </p>
              <div class="flex flex-col gap-1.5">
                <div
                  v-for="entry in factionNpcs.filter(e => !e.status || e.status === 'Active')"
                  :key="entry.id"
                  class="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                >
                  <div class="flex-1 min-w-0">
                    <span class="font-cinzel text-xs font-semibold text-foreground">{{ entry.npc.name }}</span>
                    <span v-if="entry.npc.race || entry.npc.occupation" class="font-fell text-[11px] text-muted-foreground italic ml-2">
                      {{ [entry.npc.race, entry.npc.occupation].filter(Boolean).join(' · ') }}
                    </span>
                  </div>
                  <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">{{ entry.role ?? 'Member' }}</span>
                </div>
              </div>
            </div>

            <!-- Notes -->
            <PlayerNotesWidget entity-type="faction" :entity-id="selected.id" placeholder="Your thoughts on this faction…" />
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Shield, XIcon } from "lucide-vue-next";
import { usePlayerVisibleFactions, usePartyMemberFactions, usePlayerFactionNpcs } from "@/composables/useFactions";
import { useAuthStore } from "@/stores/auth";
import type { Faction } from "@/types/faction.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";

const auth = useAuthStore();
const { data: factions, isLoading } = usePlayerVisibleFactions();

const search   = ref("");
const selected = ref<Faction | null>(null);

// Player's faction memberships — used to check if they're in the selected faction
const myMemberId = computed(() => auth.linkedPartyMemberId ?? "");
const { data: myFactionMemberships } = usePartyMemberFactions(myMemberId);

const playerMembership = computed(() => {
  if (!selected.value || !myFactionMemberships.value) return null;
  return myFactionMemberships.value.find((m) => m.faction_id === selected.value!.id) ?? null;
});

// NPC members of the selected faction — only fetched if the player is a member (RLS enforces this)
const selectedFactionId = computed(() => selected.value?.id ?? "");
const isInFaction = computed(() => !!playerMembership.value);
const { data: factionNpcs } = usePlayerFactionNpcs(selectedFactionId, isInFaction);

const filtered = computed(() => {
  const q = search.value.toLowerCase().trim();
  if (!q) return factions.value ?? [];
  return (factions.value ?? []).filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (f.faction_type ?? "").toLowerCase().includes(q) ||
      (f.tags ?? []).some((t) => t.toLowerCase().includes(q)),
  );
});

function open(faction: Faction) {
  selected.value = faction;
}

function close() {
  selected.value = null;
}
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
