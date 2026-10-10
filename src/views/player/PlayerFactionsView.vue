<template>
  <div>
    <PageHeader flush title="Factions" description="Organizations and powers at play in the world." />

    <ListSkeleton v-if="isLoading" variant="tiles" :columns="2" />

    <p
      v-else-if="!factions?.length"
      class="text-center text-body text-muted-foreground italic py-12"
    >
      No factions have been revealed yet.
    </p>

    <div v-else class="flex flex-col gap-3">
      <!-- Filter bar -->
      <div class="flex flex-wrap items-center gap-2">
        <AppInput
          v-model="playerUi.playerFactionsSearch"
          type="search"
          placeholder="Filter factions…"
          tone="card"
          size="body"
          class="flex-1 min-w-40"
        />
        <AppButton
          v-if="playerUi.playerFactionsHasActiveFilters"
          variant="subtle"
          size="sm"
          label="Clear"
          class="shrink-0"
          @click="playerUi.resetPlayerFactionsFilters()"
        />
      </div>

      <p v-if="!filtered.length" class="text-body text-muted-foreground italic text-center py-6">
        No factions match your filter.
      </p>

      <VirtualGrid
        v-else
        :items="filtered"
        :item-key="factionKey"
        :columns="factionColumns"
        :estimate-row-height="FACTION_ROW_PX"
      >
        <template #default="{ item: faction }">
        <div
          class="rounded-lg border overflow-hidden cursor-pointer transition-colors"
          :class="myFactionIds.has(faction.id)
            ? 'border-tone-success/50 bg-tone-success/10 hover:border-tone-success/70'
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
              <h3 class="text-heading-xs font-bold text-foreground truncate">{{ faction.name }}</h3>
              <p v-if="faction.faction_type" class="text-caption text-muted-foreground italic">{{ faction.faction_type }}</p>
              <RelationshipMark v-if="faction.party_standing !== 'unknown'" :relationship="faction.party_standing" class="mt-1" />
              <div v-if="faction.tags?.length" class="flex flex-wrap gap-1 mt-1">
                <span
                  v-for="tag in faction.tags.slice(0, 3)"
                  :key="tag"
                  class="inline-block bg-muted rounded px-1.5 py-0.5 text-label text-muted-foreground"
                >{{ tag }}</span>
              </div>
            </div>
          </div>
        </div>
        </template>
      </VirtualGrid>
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
              <RelationshipMark v-if="selected.party_standing !== 'unknown'" :relationship="selected.party_standing" class="mt-1" />
            </div>
            <AppButton
              variant="ghost"
              size="icon-xs"
              icon-size="md"
              :icon="IconClose"
              aria-label="Close"
              class="shrink-0"
              @click="close"
            />
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
                    ? 'border-tone-success/50 bg-tone-success/10'
                    : 'border-border'"
                >
                  <div class="flex-1 min-w-0">
                    <span class="text-caption font-semibold text-foreground">{{ entry.party_member.name }}</span>
                    <span v-if="speciesNameOf(entry.party_member) || entry.party_member.class" class="text-caption text-muted-foreground italic ml-2">
                      {{ [speciesNameOf(entry.party_member), entry.party_member.class].filter(Boolean).join(' · ') }}
                    </span>
                    <span v-if="entry.party_member.id === myMemberId" class="text-label text-ink-success ml-2">(You)</span>
                  </div>
                  <span class="text-caption-sm text-muted-foreground shrink-0">{{ entry.role ?? 'Member' }}</span>
                </div>
                <!-- NPC members (shared with player) -->
                <div
                  v-for="entry in visibleFactionNpcs"
                  :key="entry.id"
                  class="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2"
                >
                  <div class="flex-1 min-w-0">
                    <span class="text-caption font-semibold text-foreground">{{ getNpcDisplayName(entry.npc) ?? '???' }}</span>
                    <span v-if="entry.npc.race || entry.npc.occupation" class="text-caption text-muted-foreground italic ml-2">
                      {{ [entry.npc.race, entry.npc.occupation].filter(Boolean).join(' · ') }}
                    </span>
                  </div>
                  <span class="text-caption-sm text-muted-foreground shrink-0">{{ entry.role ?? 'Member' }}</span>
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
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import { useBreakpointColumns } from "@/composables/useGridColumns";
import PageHeader from "@/components/common/list/PageHeader.vue";
import { ref, computed } from "vue";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import { IconClose, IconShield } from '@/lib/icons';
import { useSpeciesNames } from "@/composables/rules/useSpecies";
import { usePlayerVisibleFactions, usePartyMemberFactions, usePlayerFactionNpcs, usePlayerFactionPartyMembers } from "@/composables/factions/useFactions";
import { useSharedNpcs } from "@/composables/npcs/useNpcs";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import { usePlayerUiStore } from "@/stores/ui/player";
import type { Faction } from "@/types/faction.types";
import FocalImage from "@/components/common/media/FocalImage.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import PlayerNotesWidget from "@/components/player/PlayerNotesWidget.vue";
import RelationshipMark from "@/components/common/entity/RelationshipMark.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";

const auth = useAuthStore();
const appUi = useAppUiStore();
const playerUi = usePlayerUiStore();
const { data: factions, isLoading } = usePlayerVisibleFactions();

const selected = ref<Faction | null>(null);

// In DM preview, use the previewed party member; otherwise use the real player's link.
const myMemberId = computed(() => {
  if (appUi.dmPreviewMode) return appUi.dmPreviewPartyMemberId ?? "";
  return auth.linkedPartyMemberId ?? "";
});
const { data: myFactionMemberships } = usePartyMemberFactions(myMemberId);

// Set of faction IDs this player/character belongs to.
const myFactionIds = computed(() =>
  new Set((myFactionMemberships.value ?? []).map((m) => m.faction_id)),
);

// The server projection already applies the visibility rule (shared with this
// character, or this character belongs), for a real player and, through the
// preview member id, for a DM previewing one. Nothing to filter here.
const visibleFactions = computed(() => factions.value ?? []);

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
const speciesNameOf = useSpeciesNames(() => (factionPcMembers.value ?? []).map((e) => e.party_member));

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
  const q = playerUi.playerFactionsSearch.toLowerCase().trim();
  if (!q) return sortedFactions.value;
  return sortedFactions.value.filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      (f.faction_type ?? "").toLowerCase().includes(q) ||
      (f.tags ?? []).some((t) => t.toLowerCase().includes(q)),
  );
});

// Windowed: the world's factions grow with the campaign. Mirrors the
// `grid-cols-1 sm:grid-cols-2` it replaced.
const factionColumns = useBreakpointColumns({ base: 1, sm: 2 });
const factionKey = (faction: { id: string }) => faction.id;
// Row height before a row is measured (px): 74-82px across 26 factions, 82 the median, measured at a 390px
// phone on 8 Oct 2026 over the dev:campaigns fixture. It decides where a
// restored scroll lands, since coming back from a detail re-renders every
// unmeasured row above the viewport.
const FACTION_ROW_PX = 82;

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
