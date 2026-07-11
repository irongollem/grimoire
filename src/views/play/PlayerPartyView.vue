<template>
  <div class="space-y-8">

    <!-- ── The Party ───────────────────────────────────────────────────────── -->
    <section>
      <h2 class="font-cinzel text-lg font-bold text-foreground mb-4">The Party</h2>

      <div v-if="partyLoading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>
      <p v-else-if="!members?.length" class="font-fell text-muted-foreground italic">
        No party members yet.
      </p>
      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">

        <!-- Group portrait card — spans 2 columns -->
        <div
          v-if="groupPortraitUrl"
          class="col-span-2 rounded-lg border border-border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
          title="View group portrait"
          @click="lightboxSrc = groupPortraitUrl"
        >
          <img
            :src="groupPortraitUrl"
            alt="Party group portrait"
            class="w-full h-full object-cover"
          />
        </div>
        <template v-for="entry in sortedParty" :key="entry.data.id">
          <PlayerPartyMemberCard
            v-if="entry.kind === 'member'"
            :member="entry.data"
            :is-own="entry.data.id === auth.linkedPartyMemberId"
            :show-numeric-hp="showNumericHp(entry.data)"
            :subtitle="memberSubtitle(entry.data)"
            @click="openMember(entry.data)"
          />
          <PlayerPartyCompanionCard
            v-else
            :companion="entry.data"
            :owner-name="ownerName(entry.data)"
            :show-numeric-hp="showCompanionNumericHp(entry.data)"
            @click="openCompanion(entry.data)"
          />
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
            <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
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
            <option v-for="(label, value) in NPC_RELATIONSHIP_LABELS" :key="value" :value="value">
              {{ label }}
            </option>
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
        <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
          <PlayerNpcCard
            v-for="npc in filteredNpcs"
            :key="npc.id"
            :npc="npc"
            :location="npc.player_visible_fields.includes('location') ? resolvedLocation(npc) : undefined"
            :is-new="isNpcNew(npc.id, npc.updated_at)"
            @click="openNpc(npc)"
          />
        </div>
      </template>
    </section>

    <!-- ── Party member lightbox ───────────────────────────────────────────── -->
    <PartyMemberLightbox :member="selectedMember" @close="closeMember" />

    <!-- ── NPC lightbox ────────────────────────────────────────────────────── -->
    <PlayerPartyNpcLightbox :npc="selectedNpc" @close="closeNpc" />

    <!-- ── Companion lightbox ──────────────────────────────────────────────── -->
    <PlayerPartyCompanionLightbox
      :companion="selectedCompanion"
      :owner-name="selectedCompanion ? ownerName(selectedCompanion) : ''"
      @close="closeCompanion"
    />

  </div>

  <ImageLightbox :src="lightboxSrc" alt="Party group portrait" @close="lightboxSrc = null" />
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconSearch } from "@/lib/icons";
import ImageLightbox from "@/components/common/ImageLightbox.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useParty } from "@/composables/useParty";
import { useSharedNpcs } from "@/composables/useNpcs";
import { useReadItems, useMarkRead } from "@/composables/useReadItems";
import { useSharedLocations } from "@/composables/useLocations";
import { useCompanions } from "@/composables/useCompanions";
import { usePlayerNpcRatings } from "@/composables/usePlayerNpcRatings";
import PartyMemberLightbox from "@/components/player/PartyMemberLightbox.vue";
import PlayerNpcCard from "@/components/play/PlayerNpcCard.vue";
import PlayerPartyMemberCard from "@/components/play/PlayerPartyMemberCard.vue";
import PlayerPartyCompanionCard from "@/components/play/PlayerPartyCompanionCard.vue";
import PlayerPartyNpcLightbox from "@/components/play/PlayerPartyNpcLightbox.vue";
import PlayerPartyCompanionLightbox from "@/components/play/PlayerPartyCompanionLightbox.vue";
import type { Companion } from "@/types/companion.types";
import type { PartyMember } from "@/types/party.types";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import { getDisplayRace } from "@/lib/partyMemberDisplay";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import type { Npc } from "@/types/npc.types";
import { NPC_RELATIONSHIP_LABELS } from "@/types/npc.types";
import type { HealthVisibility } from "@/types/encounter.types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const campaign = useCampaignStore();
const groupPortraitUrl = computed(() => campaign.activeCampaign?.group_portrait_url ?? null);
const lightboxSrc      = ref<string | null>(null);
const viewerMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId
);
// DM not in preview mode sees true forms; players (even without a linked party member) see disguises.
const viewerIsDm = computed(() => !ui.dmPreviewMode && auth.isDM);
const { data: members, isLoading: partyLoading } = useParty();
const speciesNameMap = useSpeciesNameMap();
const { data: allSharedNpcs, isLoading: npcsLoading } = useSharedNpcs();
const { isNew: isNpcNew } = useReadItems("npc");
const { mutate: markNpcRead } = useMarkRead();
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
const { data: sharedLocations } = useSharedLocations();

const locationMap = computed(() => {
  const m = new Map<string, string>();
  for (const loc of sharedLocations.value ?? []) m.set(loc.id, loc.name);
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

const { getRating, ratingTick } = usePlayerNpcRatings(() => npcs.value ?? []);

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
    // 3. Alphabetically by display name (nameless NPCs — name not player-visible — sort last)
    const nameA = getNpcDisplayName(a);
    const nameB = getNpcDisplayName(b);
    if (nameA && nameB) return nameA.localeCompare(nameB);
    return nameA ? -1 : nameB ? 1 : 0;
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
      const name = npc.player_visible_fields.includes("name") ? getNpcDisplayName(npc) : null;
      if (name) parts.push(name.toLowerCase());
      if (npc.player_visible_fields.includes("race") && npc.race) parts.push(npc.race.toLowerCase());
      if (npc.player_visible_fields.includes("occupation") && npc.occupation) parts.push(npc.occupation.toLowerCase());
      return parts.some((p) => p.includes(q));
    });
  }

  // status & relationship are always shown to players (unknown = soft-hidden),
  // so they are NOT gated on player_visible_fields — those keys were removed from
  // NPC_PLAYER_FIELDS, so gating on them would match nothing.
  if (ui.playerPeopleFilterRelationship !== "all") {
    list = list.filter((npc) => npc.relationship === ui.playerPeopleFilterRelationship);
  }

  if (ui.playerPeopleFilterStatus !== "all") {
    list = list.filter((npc) => npc.status === ui.playerPeopleFilterStatus);
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

// ── NPC lightbox ─────────────────────────────────────────────────────────────
const selectedNpc = ref<Npc | null>(null);

function openNpc(npc: Npc) {
  markNpcRead({ entityType: "npc", entityId: npc.id });
  selectedNpc.value = npc;
}

function closeNpc() {
  selectedNpc.value = null;
}

// Auto-open NPC lightbox when navigated from a chat "View →" link (?npc=<id>)
watch(
  () => [route.query.npc, allSharedNpcs.value] as const,
  ([npcId]) => {
    if (!npcId || typeof npcId !== "string" || !allSharedNpcs.value) return;
    const npc = allSharedNpcs.value.find((n) => n.id === npcId);
    if (!npc) return;
    openNpc(npc);
    const { npc: _npc, ...rest } = route.query;
    router.replace({ query: rest });
  },
  { immediate: true },
);

// ── Companion lightbox ────────────────────────────────────────────────────────
const selectedCompanion = ref<Companion | null>(null);

function openCompanion(c: Companion) { selectedCompanion.value = c; }
function closeCompanion() { selectedCompanion.value = null; }

// ── Companion helpers ─────────────────────────────────────────────────────────
function ownerName(c: Companion): string {
  if (!c.owner_party_member_id) return "";
  return members.value?.find((m) => m.id === c.owner_party_member_id)?.name ?? "";
}

function showCompanionNumericHp(c: Companion) {
  return healthVis.value === "strategic" || c.owner_party_member_id === viewerMemberId.value;
}

// ── Member helpers ────────────────────────────────────────────────────────────
const healthVis = computed(() =>
  (campaign.activeCampaign?.health_visibility as HealthVisibility) ?? "strategic",
);

function showNumericHp(m: PartyMember) {
  return healthVis.value === "strategic" || m.id === viewerMemberId.value;
}

function memberSubtitle(m: PartyMember): string {
  return [
    getDisplayRace(m, speciesNameMap.value.get(m.species_id ?? "") ?? null, viewerMemberId.value, viewerIsDm.value),
    m.class,
  ].filter(Boolean).join(" ");
}
</script>
