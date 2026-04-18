<template>
  <div class="w-fit mx-auto space-y-8">

    <!-- ── The Party ───────────────────────────────────────────────────────── -->
    <section>
      <h2 class="font-cinzel text-lg font-bold text-foreground mb-4">The Party</h2>

      <div v-if="partyLoading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>
      <p v-else-if="!members?.length" class="font-fell text-muted-foreground italic">
        No party members yet.
      </p>
      <div v-else class="flex flex-wrap gap-4">
        <template v-for="entry in sortedParty" :key="entry.data.id">
          <!-- Party member card -->
          <div
            v-if="entry.kind === 'member'"
            class="flex flex-col rounded-lg border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors shrink-0 w-50"
            :class="entry.data.id === auth.linkedPartyMemberId ? 'border-primary/40' : 'border-border'"
            @click="openMember(entry.data)"
          >
            <div class="relative aspect-3/4 bg-muted overflow-hidden shrink-0 group">
              <FocalImage
                v-if="entry.data.portrait_url"
                :src="entry.data.portrait_url"
                :alt="entry.data.name"
                format="portrait"
                :focal-point="entry.data.portrait_focal_point ?? null"
                class="group-hover:scale-105 transition-transform duration-300"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
                <UserIcon class="h-10 w-10" />
              </div>
              <span
                v-if="entry.data.id === auth.linkedPartyMemberId"
                class="absolute top-2 left-2 font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground tracking-wider"
              >You</span>
            </div>
            <div class="p-2.5 flex flex-col gap-1.5">
              <div>
                <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ entry.data.name }}</h3>
                <p class="font-fell text-xs text-muted-foreground italic truncate">
                  {{ [getDisplayRace(entry.data, speciesNameMap.get(entry.data.species_id ?? '') ?? null, viewerMemberId), entry.data.class].filter(Boolean).join(' ') }}
                  <span v-if="entry.data.level" class="font-cinzel not-italic text-primary ml-1">Lv{{ entry.data.level }}</span>
                </p>
              </div>
              <div>
                <div class="flex items-center justify-between mb-0.5">
                  <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">HP</span>
                  <span class="font-cinzel text-[10px]" :class="hpColor(entry.data)">{{ entry.data.current_hp }} / {{ entry.data.max_hp }}</span>
                </div>
                <div class="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div class="h-full rounded-full transition-all" :class="hpBarColor(entry.data)"
                    :style="{ width: `${Math.max(0, Math.min(100, (entry.data.current_hp / entry.data.max_hp) * 100))}%` }" />
                </div>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="flex items-center gap-1">
                  <Shield class="h-3 w-3 text-muted-foreground shrink-0" />
                  <span class="font-cinzel text-xs font-bold text-foreground">{{ entry.data.ac }}</span>
                </span>
                <span
                  v-for="cond in (entry.data.conditions ?? []).slice(0, 2)" :key="cond"
                  class="font-cinzel text-[10px] px-1 py-0.5 rounded bg-destructive/10 text-destructive tracking-wider"
                >{{ cond }}</span>
                <span v-if="(entry.data.conditions?.length ?? 0) > 2" class="font-fell text-[10px] text-muted-foreground italic">
                  +{{ (entry.data.conditions?.length ?? 0) - 2 }}
                </span>
              </div>
            </div>
          </div>

          <!-- Companion card -->
          <div
            v-else
            class="flex flex-col rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors shrink-0 w-50"
            @click="openCompanion(entry.data)"
          >
            <div class="relative aspect-3/4 bg-muted overflow-hidden shrink-0">
              <FocalImage
                v-if="entry.data.portrait_url"
                :src="entry.data.portrait_url"
                :alt="entry.data.name"
                format="portrait"
                :focal-point="entry.data.portrait_focal_point ?? null"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/30">
                <UserIcon class="h-10 w-10" />
              </div>
              <span
                class="absolute top-2 right-2 font-cinzel text-[10px] px-1.5 py-0.5 rounded tracking-wider text-white"
                :style="{ backgroundColor: COMPANION_TYPE_COLORS[entry.data.companion_type] + 'CC' }"
              >{{ COMPANION_TYPE_LABELS[entry.data.companion_type] }}</span>
            </div>
            <div class="p-2.5 flex flex-col gap-1.5">
              <div>
                <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ entry.data.name }}</h3>
                <p class="font-fell text-xs text-muted-foreground italic truncate">{{ ownerName(entry.data) || 'Party companion' }}</p>
              </div>
              <div>
                <div class="flex items-center justify-between mb-0.5">
                  <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">HP</span>
                  <span class="font-cinzel text-[10px]" :class="companionHpColor(entry.data)">{{ entry.data.current_hp }} / {{ entry.data.max_hp }}</span>
                </div>
                <div class="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div class="h-full rounded-full transition-all" :class="companionHpBarColor(entry.data)"
                    :style="{ width: `${Math.max(0, Math.min(100, (entry.data.current_hp / entry.data.max_hp) * 100))}%` }" />
                </div>
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="flex items-center gap-1">
                  <Shield class="h-3 w-3 text-muted-foreground shrink-0" />
                  <span class="font-cinzel text-xs font-bold text-foreground">{{ entry.data.ac }}</span>
                </span>
                <span
                  v-for="cond in (entry.data.conditions ?? []).slice(0, 2)" :key="cond"
                  class="font-cinzel text-[10px] px-1 py-0.5 rounded bg-destructive/10 text-destructive tracking-wider"
                >{{ cond }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- ── People (shared NPCs) ────────────────────────────────────────────── -->
    <section v-if="npcs?.length || npcsLoading">
      <h2 class="font-cinzel text-lg font-bold text-foreground mb-3">People</h2>

      <div v-if="npcsLoading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>
      <template v-else>
        <!-- Filter bar -->
        <div class="flex flex-wrap gap-2 mb-4">
          <div class="relative flex-1 min-w-48">
            <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              v-model="ui.playerPeopleSearch"
              type="text"
              placeholder="Search people…"
              class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <select
            v-model="ui.playerPeopleFilterRelationship"
            class="bg-card border border-border rounded-md px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All relations</option>
            <option value="ally">Ally</option>
            <option value="neutral">Neutral</option>
            <option value="enemy">Enemy</option>
            <option value="unknown">Unknown</option>
          </select>
          <select
            v-model="ui.playerPeopleFilterStatus"
            class="bg-card border border-border rounded-md px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All statuses</option>
            <option value="alive">Alive</option>
            <option value="dead">Dead</option>
            <option value="missing">Missing</option>
            <option value="unknown">Unknown</option>
          </select>
          <select
            v-if="availableLocations.length"
            v-model="ui.playerPeopleFilterLocation"
            class="bg-card border border-border rounded-md px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All locations</option>
            <option v-for="loc in availableLocations" :key="loc.id" :value="loc.id">{{ loc.name }}</option>
          </select>
          <button
            v-if="ui.playerPeopleHasActiveFilters"
            type="button"
            class="px-3 py-1.5 font-cinzel text-xs tracking-wide text-muted-foreground hover:text-foreground border border-border rounded-md hover:border-foreground/30 transition-colors"
            @click="ui.resetPlayerPeopleFilters()"
          >Clear</button>
        </div>

        <p
          v-if="!filteredNpcs.length"
          class="font-fell text-sm text-muted-foreground italic"
        >No people match your filters.</p>
        <div v-else class="flex flex-wrap gap-4">
          <PlayerNpcCard
            v-for="npc in filteredNpcs"
            :key="npc.id"
            :npc="npc"
            :location="npc.player_visible_fields.includes('location') ? resolvedLocation(npc) : undefined"
            class="shrink-0 w-50"
            @click="openNpc(npc)"
          />
        </div>
      </template>
    </section>

    <!-- ── Party member lightbox ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="selectedMember" class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" @click.self="closeMember">
        <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div class="relative shrink-0">
            <div v-if="selectedMember.portrait_url" class="w-full h-72 overflow-hidden">
              <FocalImage :src="selectedMember.portrait_url" :alt="selectedMember.name" format="portrait" :focal-point="selectedMember.portrait_focal_point ?? null" />
            </div>
            <button class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors" @click="closeMember">
              <XIcon class="h-4 w-4" />
            </button>
            <span v-if="selectedMember.id === auth.linkedPartyMemberId"
              class="absolute top-2 left-2 font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-primary text-primary-foreground tracking-wider">You</span>
          </div>
          <div class="p-4 overflow-y-auto space-y-4">
            <div>
              <h2 class="font-cinzel text-lg font-bold text-foreground">{{ selectedMember.name }}</h2>
              <p class="font-fell text-sm text-muted-foreground italic">
                {{ [getDisplayRace(selectedMember, speciesNameMap.get(selectedMember.species_id ?? '') ?? null, viewerMemberId), selectedMember.class].filter(Boolean).join(' ') }}
                <span v-if="selectedMember.level" class="font-cinzel not-italic text-primary ml-1">Lv{{ selectedMember.level }}</span>
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-md bg-muted p-2.5">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">HP</span>
                  <span class="font-cinzel text-sm font-bold" :class="hpColor(selectedMember)">
                    {{ selectedMember.current_hp }} / {{ selectedMember.max_hp }}
                  </span>
                </div>
                <div class="h-1.5 rounded-full bg-background overflow-hidden">
                  <div class="h-full rounded-full transition-all" :class="hpBarColor(selectedMember)"
                    :style="{ width: `${Math.max(0, Math.min(100, (selectedMember.current_hp / selectedMember.max_hp) * 100))}%` }" />
                </div>
              </div>
              <div class="rounded-md bg-muted p-2.5 flex items-center gap-2">
                <Shield class="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">AC</p>
                  <p class="font-cinzel text-sm font-bold text-foreground">{{ selectedMember.ac }}</p>
                </div>
              </div>
            </div>
            <div v-if="selectedMember.conditions?.length" class="flex flex-wrap gap-1.5">
              <span v-for="cond in selectedMember.conditions" :key="cond"
                class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive tracking-wider">{{ cond }}</span>
            </div>
            <!-- Species detail — shows true or disguise species data depending on who is viewing -->
            <div v-if="displaySpecies" class="space-y-3 border-t border-border pt-3">
              <div v-if="displaySpecies.image_url" class="rounded-md overflow-hidden">
                <FocalImage
                  :src="displaySpecies.image_url"
                  :alt="displaySpecies.name"
                  format="landscape"
                  :focal-point="displaySpecies.focal_point ?? null"
                />
              </div>
              <h3 class="font-cinzel text-sm font-bold text-foreground">{{ displaySpecies.name }}</h3>
              <div class="flex flex-wrap gap-3 font-fell text-xs text-muted-foreground italic">
                <span v-if="displaySpecies.size">Size: {{ displaySpecies.size }}</span>
                <span v-if="displaySpecies.speed?.walk">Speed: {{ displaySpecies.speed.walk }} ft.</span>
                <span v-if="displaySpecies.languages?.length">Languages: {{ displaySpecies.languages.join(', ') }}</span>
              </div>
              <RichTextViewer v-if="displaySpecies.description" :content="displaySpecies.description" />
              <div v-if="displaySpecies.traits?.length" class="space-y-2">
                <div v-for="trait in displaySpecies.traits" :key="trait.name">
                  <p class="font-cinzel text-xs font-semibold text-foreground">{{ trait.name }}</p>
                  <RichTextViewer :content="trait.description" class="font-fell text-xs text-muted-foreground" />
                </div>
              </div>
            </div>

            <PlayerNotesWidget v-if="selectedMember" entity-type="party_member" :entity-id="selectedMember.id" placeholder="Your thoughts on this party member…" />
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── NPC lightbox ────────────────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="selectedNpc" class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" @click.self="closeNpc">
        <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div class="relative shrink-0">
            <div v-if="selectedNpc.player_visible_fields.includes('portrait') && selectedNpcDisplay.portrait" class="w-full h-72 overflow-hidden">
              <FocalImage
                :src="selectedNpcDisplay.portrait!"
                :alt="selectedNpc.player_visible_fields.includes('name') ? selectedNpcDisplay.name : '???'"
                format="portrait"
                :focal-point="selectedNpcDisplay.focalPoint"
              />
            </div>
            <button class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors" @click="closeNpc">
              <XIcon class="h-4 w-4" />
            </button>
          </div>
          <div class="p-4 overflow-y-auto space-y-4">
            <div>
              <div class="flex items-start justify-between gap-3">
                <h2 class="font-cinzel text-lg font-bold text-foreground">
                  {{ selectedNpc.player_visible_fields.includes('name') ? selectedNpcDisplay.name : '???' }}
                </h2>
                <div class="flex items-center gap-0.5 shrink-0 pt-1" @click.stop>
                  <button
                    v-for="n in [1,2,3,4,5]"
                    :key="n"
                    type="button"
                    class="text-lg leading-none transition-colors"
                    :class="n <= (ratingMap.get(selectedNpc.id) ?? 0) ? 'text-yellow-400' : 'text-muted-foreground/25 hover:text-yellow-400/60'"
                    :title="n === 1 ? 'Not relevant' : n === 5 ? 'Very relevant' : `Relevance ${n}`"
                    @click="setRating(selectedNpc.id, n)"
                  >★</button>
                </div>
              </div>
              <div class="flex flex-wrap gap-2 mt-1">
                <span v-if="selectedNpc.player_visible_fields.includes('relationship')"
                  class="px-2 py-0.5 rounded text-[11px] font-cinzel font-bold tracking-wider uppercase text-white"
                  :style="{ backgroundColor: relColor(selectedNpc.relationship) + 'CC' }">
                  {{ selectedNpc.relationship }}
                </span>
                <span v-if="selectedNpc.player_visible_fields.includes('status')"
                  class="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted font-cinzel text-[11px] tracking-wider">
                  <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: statusColor(selectedNpc.status) }" />
                  {{ selectedNpc.status }}
                </span>
              </div>
              <p v-if="selectedNpc.player_visible_fields.includes('race') && selectedNpc.race"
                class="mt-1 font-fell text-sm text-muted-foreground italic">
                {{ selectedNpc.race }}
              </p>
              <p v-if="selectedNpc.player_visible_fields.includes('occupation') && selectedNpc.occupation"
                class="font-fell text-sm text-muted-foreground">{{ selectedNpc.occupation }}</p>
            </div>
            <!-- DM's per-PC relation note -->
            <div v-if="myNpcPcNote" class="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
              <div class="px-3 py-2 border-b border-primary/20">
                <p class="font-cinzel text-[10px] font-semibold tracking-widest text-primary/70">YOUR CONNECTION</p>
              </div>
              <div class="px-3 py-2.5">
                <RichTextViewer :content="myNpcPcNote" />
              </div>
            </div>
            <PlayerNotesWidget v-if="selectedNpc" entity-type="npc" :entity-id="selectedNpc.id" placeholder="Your observations about this character…" />
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Companion lightbox ──────────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="selectedCompanion" class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" @click.self="closeCompanion">
        <div class="bg-card rounded-xl border border-border w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div class="relative shrink-0">
            <div v-if="selectedCompanion.portrait_url" class="w-full h-72 overflow-hidden">
              <FocalImage
                :src="selectedCompanion.portrait_url"
                :alt="selectedCompanion.name"
                format="portrait"
                :focal-point="selectedCompanion.portrait_focal_point ?? null"
              />
            </div>
            <button class="absolute top-2 right-2 bg-black/50 rounded-full p-1 text-white hover:bg-black/70 transition-colors" @click="closeCompanion">
              <XIcon class="h-4 w-4" />
            </button>
            <span
              class="absolute top-2 left-2 font-cinzel text-[10px] px-1.5 py-0.5 rounded tracking-wider text-white"
              :style="{ backgroundColor: COMPANION_TYPE_COLORS[selectedCompanion.companion_type] + 'CC' }"
            >{{ COMPANION_TYPE_LABELS[selectedCompanion.companion_type] }}</span>
          </div>
          <div class="p-4 overflow-y-auto space-y-4">
            <div>
              <h2 class="font-cinzel text-lg font-bold text-foreground">{{ selectedCompanion.name }}</h2>
              <p v-if="ownerName(selectedCompanion)" class="font-fell text-sm text-muted-foreground italic">
                {{ ownerName(selectedCompanion) }}'s companion
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-md bg-muted p-2.5">
                <div class="flex items-center justify-between mb-1">
                  <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider">HP</span>
                  <span class="font-cinzel text-sm font-bold" :class="companionHpColor(selectedCompanion)">
                    {{ selectedCompanion.current_hp }} / {{ selectedCompanion.max_hp }}
                  </span>
                </div>
                <div class="h-1.5 rounded-full bg-background overflow-hidden">
                  <div class="h-full rounded-full transition-all" :class="companionHpBarColor(selectedCompanion)"
                    :style="{ width: `${Math.max(0, Math.min(100, (selectedCompanion.current_hp / selectedCompanion.max_hp) * 100))}%` }" />
                </div>
              </div>
              <div class="rounded-md bg-muted p-2.5 flex items-center gap-2">
                <Shield class="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">AC</p>
                  <p class="font-cinzel text-sm font-bold text-foreground">{{ selectedCompanion.ac }}</p>
                </div>
              </div>
            </div>
            <div v-if="selectedCompanion.conditions?.length" class="flex flex-wrap gap-1.5">
              <span v-for="cond in selectedCompanion.conditions" :key="cond"
                class="font-cinzel text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive tracking-wider">{{ cond }}</span>
            </div>
            <PlayerNotesWidget v-if="selectedCompanion" entity-type="companion" :entity-id="selectedCompanion.id" placeholder="Your thoughts on this companion…" />
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { UserIcon, XIcon, Shield, Search } from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useParty } from "@/composables/useParty";
import { useSharedNpcs } from "@/composables/useNpcs";
import { useAllLocations } from "@/composables/useLocations";
import { useCompanions } from "@/composables/useCompanions";
import { usePlayerNpcRatings } from "@/composables/usePlayerNpcRatings";
import { useMyNpcPcNote } from "@/composables/useNpcPcNotes";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import PlayerNotesWidget from "@/components/common/PlayerNotesWidget.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import PlayerNpcCard from "@/components/play/PlayerNpcCard.vue";
import { COMPANION_TYPE_LABELS, COMPANION_TYPE_COLORS } from "@/types/companion.types";
import type { Companion } from "@/types/companion.types";
import type { PartyMember } from "@/types/party.types";
import { getNpcDisplayName, getNpcDisplayPortrait, getNpcDisplayFocalPoint } from "@/lib/npcDisplay";
import { getDisplayRace, getDisplaySpeciesId } from "@/lib/partyMemberDisplay";
import { useSpecies, useSpeciesNameMap } from "@/composables/useSpecies";
import type { Npc, NpcRelationship, NpcStatus } from "@/types/npc.types";

const auth = useAuthStore();
const ui = useUiStore();
const viewerMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId
);
const { data: members, isLoading: partyLoading } = useParty();
const speciesNameMap = useSpeciesNameMap();
const { data: allSharedNpcs, isLoading: npcsLoading } = useSharedNpcs();
const npcs = computed(() => {
  const all = allSharedNpcs.value ?? [];
  const memberId = viewerMemberId.value;
  // If no character is linked yet, show nothing — the player hasn't been
  // assigned to a party member so they shouldn't see any NPC visibility lists.
  if (!memberId) return [];
  return all.filter((npc) =>
    Array.isArray(npc.player_visible_to) && npc.player_visible_to.includes(memberId)
  );
});
const { data: companions } = useCompanions();
const { data: allLocations } = useAllLocations();

const locationMap = computed(() => {
  const m = new Map<string, string>();
  for (const loc of allLocations.value ?? []) m.set(loc.id, loc.name);
  return m;
});

function resolvedLocation(npc: { location_id: string | null }) {
  return npc.location_id ? (locationMap.value.get(npc.location_id) ?? "") : "";
}

// ── Party + companion sort ────────────────────────────────────────────────────
type PartyEntry =
  | { kind: "member"; data: PartyMember }
  | { kind: "companion"; data: Companion };

const sortedParty = computed((): PartyEntry[] => {
  const myId = viewerMemberId.value;
  const allMembers = members.value ?? [];
  const allCompanions = companions.value ?? [];

  // Self first, then rest alphabetically
  const orderedMembers = [...allMembers].sort((a, b) => {
    if (a.id === myId) return -1;
    if (b.id === myId) return 1;
    return a.name.localeCompare(b.name);
  });

  // Group personal companions by owner once; avoid O(companions × members) filter-in-loop
  const byOwner = new Map<string, Companion[]>();
  const groupCompanions: Companion[] = [];
  for (const c of allCompanions) {
    if (c.owner_party_member_id) {
      const bucket = byOwner.get(c.owner_party_member_id) ?? [];
      bucket.push(c);
      byOwner.set(c.owner_party_member_id, bucket);
    } else {
      groupCompanions.push(c);
    }
  }
  for (const bucket of byOwner.values()) bucket.sort((a, b) => a.name.localeCompare(b.name));
  groupCompanions.sort((a, b) => a.name.localeCompare(b.name));

  const result: PartyEntry[] = [];
  for (const member of orderedMembers) {
    result.push({ kind: "member", data: member });
    for (const comp of byOwner.get(member.id) ?? []) {
      result.push({ kind: "companion", data: comp });
    }
  }
  for (const comp of groupCompanions) {
    result.push({ kind: "companion", data: comp });
  }
  return result;
});

const { getRating, setRating, ratingMap, ratingTick } = usePlayerNpcRatings(() => npcs.value ?? []);

const sortedNpcs = computed(() => {
  void ratingTick.value;
  return [...(npcs.value ?? [])].sort((a, b) => {
    // 1. Stars first (higher rating first)
    const ra = getRating(a.id);
    const rb = getRating(b.id);
    if (ra !== rb) return rb - ra;
    // 2. Location (with-location before none, then alphabetically by location name)
    const locA = resolvedLocation(a).toLowerCase();
    const locB = resolvedLocation(b).toLowerCase();
    if (locA && !locB) return -1;
    if (!locA && locB) return 1;
    if (locA !== locB) return locA.localeCompare(locB);
    // 3. Alphabetically by display name
    return getNpcDisplayName(a).toLowerCase().localeCompare(getNpcDisplayName(b).toLowerCase());
  });
});

// ── People filter ─────────────────────────────────────────────────────────────
const availableLocations = computed(() => {
  const seen = new Set<string>();
  const result: { id: string; name: string }[] = [];
  for (const npc of sortedNpcs.value) {
    if (npc.player_visible_fields.includes("location") && npc.location_id && !seen.has(npc.location_id)) {
      const name = locationMap.value.get(npc.location_id);
      if (name) {
        seen.add(npc.location_id);
        result.push({ id: npc.location_id, name });
      }
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
});

const filteredNpcs = computed(() => {
  void ratingTick.value;
  let list = sortedNpcs.value;

  const q = ui.playerPeopleSearch.trim().toLowerCase();
  if (q) {
    list = list.filter((npc) => {
      const parts: string[] = [];
      if (npc.player_visible_fields.includes("name")) parts.push(getNpcDisplayName(npc).toLowerCase());
      if (npc.player_visible_fields.includes("race") && npc.race) parts.push(npc.race.toLowerCase());
      if (npc.player_visible_fields.includes("occupation") && npc.occupation) parts.push(npc.occupation.toLowerCase());
      return parts.some((p) => p.includes(q));
    });
  }

  if (ui.playerPeopleFilterRelationship !== "all") {
    list = list.filter(
      (npc) => npc.player_visible_fields.includes("relationship") && npc.relationship === ui.playerPeopleFilterRelationship
    );
  }

  if (ui.playerPeopleFilterStatus !== "all") {
    list = list.filter(
      (npc) => npc.player_visible_fields.includes("status") && npc.status === ui.playerPeopleFilterStatus
    );
  }

  if (ui.playerPeopleFilterLocation) {
    list = list.filter((npc) => npc.location_id === ui.playerPeopleFilterLocation);
  }

  return list;
});

// ── Party member lightbox ────────────────────────────────────────────────────
const selectedMember = ref<PartyMember | null>(null);

function openMember(m: PartyMember) {
  selectedMember.value = m;
}

function closeMember() {
  selectedMember.value = null;
}

const displaySpeciesId = computed(() =>
  selectedMember.value
    ? (getDisplaySpeciesId(selectedMember.value, viewerMemberId.value) ?? "")
    : "",
);
const { data: displaySpecies } = useSpecies(displaySpeciesId);

// ── NPC lightbox ─────────────────────────────────────────────────────────────
const selectedNpc = ref<Npc | null>(null);
const selectedNpcId = computed(() => selectedNpc.value?.id ?? "");
const selectedNpcDisplay = computed(() => ({
  name: selectedNpc.value ? getNpcDisplayName(selectedNpc.value) : "???",
  portrait: selectedNpc.value ? getNpcDisplayPortrait(selectedNpc.value) : null,
  focalPoint: selectedNpc.value ? getNpcDisplayFocalPoint(selectedNpc.value) : null,
}));
const { data: myNpcPcNote } = useMyNpcPcNote(selectedNpcId);

function openNpc(npc: Npc) {
  selectedNpc.value = npc;
}

function closeNpc() {
  selectedNpc.value = null;
}

// ── Companion lightbox ────────────────────────────────────────────────────────
const selectedCompanion = ref<Companion | null>(null);

function openCompanion(c: Companion) { selectedCompanion.value = c; }
function closeCompanion() { selectedCompanion.value = null; }

// ── Companion helpers ─────────────────────────────────────────────────────────
function ownerName(c: Companion): string {
  if (!c.owner_party_member_id) return "";
  return members.value?.find((m) => m.id === c.owner_party_member_id)?.name ?? "";
}
function companionHpColor(c: Companion) {
  const pct = c.current_hp / c.max_hp;
  return pct < 0.33 ? "text-destructive" : pct < 0.66 ? "text-amber-400" : "text-elven-green";
}
function companionHpBarColor(c: Companion) {
  const pct = c.current_hp / c.max_hp;
  return pct < 0.33 ? "bg-destructive" : pct < 0.66 ? "bg-amber-400" : "bg-elven-green";
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function hpColor(m: PartyMember) {
  const pct = m.current_hp / m.max_hp;
  return pct < 0.33 ? "text-destructive" : pct < 0.66 ? "text-amber-400" : "text-elven-green";
}
function hpBarColor(m: PartyMember) {
  const pct = m.current_hp / m.max_hp;
  return pct < 0.33 ? "bg-destructive" : pct < 0.66 ? "bg-amber-400" : "bg-elven-green";
}

const REL_COLORS: Record<NpcRelationship, string> = { ally: "#2563eb", neutral: "#6b7280", enemy: "#dc2626", unknown: "#9333ea" };
const STATUS_COLORS: Record<NpcStatus, string> = { alive: "#22c55e", dead: "#ef4444", missing: "#f59e0b", unknown: "#6b7280" };
function relColor(rel: NpcRelationship) { return REL_COLORS[rel] ?? "#6b7280"; }
function statusColor(s: NpcStatus) { return STATUS_COLORS[s] ?? "#6b7280"; }
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
