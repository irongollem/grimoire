<template>
  <div>
    <h1 class="text-heading-lg font-bold text-foreground mb-1">Factions</h1>
    <p class="text-body text-muted-foreground italic mb-6">Organizations and powers at play in the world.</p>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <p
      v-else-if="!factions?.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No factions have been revealed yet.
    </p>

    <div v-else class="flex flex-col gap-3">
      <!-- Filter bar -->
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="ui.playerFactionsSearch"
          type="search"
          placeholder="Filter factions…"
          class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          v-if="ui.playerFactionsHasActiveFilters"
          type="button"
          class="px-3 py-1.5 font-cinzel text-xs tracking-wide text-muted-foreground hover:text-foreground border border-border rounded-md hover:border-foreground/30 transition-colors shrink-0"
          @click="ui.resetPlayerFactionsFilters()"
        >Clear</button>
      </div>

      <p v-if="!filtered.length" class="text-body text-muted-foreground italic text-center py-6">
        No factions match your filter.
      </p>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div
          v-for="faction in filtered"
          :key="faction.id"
          class="rounded-lg border overflow-hidden cursor-pointer transition-colors"
          :class="myFactionIds.has(faction.id)
            ? 'border-emerald-500/50 bg-emerald-900/10 hover:border-emerald-400/70'
            : 'border-border bg-card hover:border-primary/50'"
          @click="open(faction)"
        >
          <div class="flex items-center gap-3 p-3">
            <!-- Emblem -->
            <div class="h-12 w-12 shrink-0 rounded-md border border-border bg-muted overflow-hidden">
              <FocalImage v-if="faction.emblem_url" :src="faction.emblem_url" format="square" :render-width="200" />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
                <IconShield class="h-6 w-6" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <h3 class="font-cinzel text-sm font-bold text-foreground truncate">{{ faction.name }}</h3>
              <p v-if="faction.faction_type" class="text-caption text-muted-foreground italic">{{ faction.faction_type }}</p>
              <div v-if="faction.tags?.length" class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="tag in faction.tags.slice(0, 3)"
                  :key="tag"
                  class="inline-block bg-muted rounded px-1.5 py-0.5 text-label md:text-sm text-muted-foreground"
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
              <FocalImage v-if="selected.emblem_url" :src="selected.emblem_url" format="square" :render-width="200" lightbox />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
                <IconShield class="h-7 w-7" />
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="text-heading-sm font-bold text-foreground">{{ selected.name }}</h2>
              <p v-if="selected.faction_type || selected.alignment" class="text-caption text-muted-foreground italic">
                {{ [selected.faction_type, selected.alignment].filter(Boolean).join(' · ') }}
              </p>
            </div>
            <button class="shrink-0 text-muted-foreground hover:text-foreground transition-colors" @click="close">
              <IconClose class="h-4 w-4" />
            </button>
          </div>

          <div class="p-4 overflow-y-auto space-y-4">
            <!-- Description -->
            <div v-if="selected.description">
              <p class="text-label-lg font-semibold text-muted-foreground mb-2">ABOUT</p>
              <RichTextViewer :content="selected.description" />
            </div>

            <!-- Fellow faction members (only visible if the player is also in this faction) -->
            <div v-if="playerMembership && (factionPcMembers?.length || factionNpcs?.length)">
              <p class="text-label-lg font-semibold text-muted-foreground mb-2">
                KNOWN MEMBERS
                <span class="font-fell font-normal normal-case italic ml-1">({{ playerMembership.role ?? 'Member' }})</span>
              </p>
              <div class="flex flex-col gap-1.5">
                <!-- PC members (party characters) -->
                <div
                  v-for="entry in factionPcMembers"
                  :key="entry.id"
                  class="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2"
                  :class="entry.party_member.id === myMemberId
                    ? 'border-emerald-500/50 bg-emerald-900/10'
                    : 'border-border'"
                >
                  <div class="flex-1 min-w-0">
                    <span class="font-cinzel text-xs font-semibold text-foreground">{{ entry.party_member.name }}</span>
                    <span v-if="speciesNameMap.get(entry.party_member.species_id ?? '') || entry.party_member.class" class="text-caption text-muted-foreground italic ml-2">
                      {{ [speciesNameMap.get(entry.party_member.species_id ?? ''), entry.party_member.class].filter(Boolean).join(' · ') }}
                    </span>
                    <span v-if="entry.party_member.id === myMemberId" class="text-label md:text-sm text-emerald-400 ml-2">(You)</span>
                  </div>
                  <span class="font-cinzel text-2xs md:text-sm text-muted-foreground shrink-0">{{ entry.role ?? 'Member' }}</span>
                </div>
                <!-- NPC members (shared with player) -->
                <div
                  v-for="entry in visibleFactionNpcs"
                  :key="entry.id"
                  class="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                >
                  <div class="flex-1 min-w-0">
                    <span class="font-cinzel text-xs font-semibold text-foreground">{{ getNpcDisplayName(entry.npc) ?? '???' }}</span>
                    <span v-if="entry.npc.race || entry.npc.occupation" class="text-caption text-muted-foreground italic ml-2">
                      {{ [entry.npc.race, entry.npc.occupation].filter(Boolean).join(' · ') }}
                    </span>
                  </div>
                  <span class="font-cinzel text-2xs md:text-sm text-muted-foreground shrink-0">{{ entry.role ?? 'Member' }}</span>
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
import { getNpcDisplayName } from "@/lib/npcDisplay";
import { IconClose, IconShield } from '@/lib/icons';
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { usePlayerVisibleFactions, usePartyMemberFactions, usePlayerFactionNpcs, usePlayerFactionPartyMembers } from "@/composables/useFactions";
import { useSharedNpcs } from "@/composables/useNpcs";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import type { Faction } from "@/types/faction.types";
import FocalImage from "@/components/common/FocalImage.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";

const auth = useAuthStore();
const ui   = useUiStore();
const { data: factions, isLoading } = usePlayerVisibleFactions();
const speciesNameMap = useSpeciesNameMap();

const selected = ref<Faction | null>(null);

// In DM preview, use the previewed party member; otherwise use the real player's link.
const myMemberId = computed(() => {
  if (ui.dmPreviewMode) return ui.dmPreviewPartyMemberId ?? "";
  return auth.linkedPartyMemberId ?? "";
});
const { data: myFactionMemberships } = usePartyMemberFactions(myMemberId);

// Set of faction IDs this player/character belongs to.
const myFactionIds = computed(() =>
  new Set((myFactionMemberships.value ?? []).map((m) => m.faction_id)),
);

// In DM preview the DM owns all rows so RLS returns everything — filter
// client-side to match what a real player would see via the DB policies:
// - direct faction member, OR
// - this party member's id is in player_visible_to
const visibleFactions = computed(() => {
  const all = factions.value ?? [];
  if (!ui.dmPreviewMode) return all;
  return all.filter((f) => {
    if (myFactionIds.value.has(f.id)) return true;
    return !!myMemberId.value && (f.player_visible_to ?? []).includes(myMemberId.value);
  });
});

// Member factions float to the top; within each group sort alphabetically.
const sortedFactions = computed(() =>
  [...visibleFactions.value].sort((a, b) => {
    const aMember = myFactionIds.value.has(a.id);
    const bMember = myFactionIds.value.has(b.id);
    if (aMember && !bMember) return -1;
    if (!aMember && bMember) return 1;
    return a.name.localeCompare(b.name);
  }),
);

const playerMembership = computed(() => {
  if (!selected.value || !myFactionMemberships.value) return null;
  return myFactionMemberships.value.find((m) => m.faction_id === selected.value!.id) ?? null;
});

// NPC + PC members of the selected faction — only fetched if the player is a member.
const selectedFactionId = computed(() => selected.value?.id ?? "");
const isInFaction = computed(() => !!playerMembership.value);
const { data: factionNpcs } = usePlayerFactionNpcs(selectedFactionId, isInFaction);
const { data: factionPcMembers } = usePlayerFactionPartyMembers(selectedFactionId, isInFaction);

// Resolve each faction NPC link to its player-visible projection (gated name /
// race / occupation). NPCs not shared with the player are omitted entirely, so a
// disguised or name-hidden faction member never exposes its real identity.
const { data: sharedNpcs } = useSharedNpcs();
const sharedNpcMap = computed(() => new Map((sharedNpcs.value ?? []).map((n) => [n.id, n] as const)));
const visibleFactionNpcs = computed(() =>
  (factionNpcs.value ?? [])
    .filter((e) => (!e.status || e.status === "Active") && sharedNpcMap.value.has(e.npc_id))
    .map((e) => ({ ...e, npc: sharedNpcMap.value.get(e.npc_id)! })),
);

const filtered = computed(() => {
  const q = ui.playerFactionsSearch.toLowerCase().trim();
  if (!q) return sortedFactions.value;
  return sortedFactions.value.filter(
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
