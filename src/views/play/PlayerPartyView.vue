<template>
  <div class="space-y-8">

    <PageHeader flush title="Party" description="The heroes and companions travelling with you.">
      <template #actions>
        <AppButton
          v-if="viewerMemberId"
          variant="subtle"
          size="sm"
          :icon="IconAdd"
          label="Add companion"
          @click="openCompanionForm(null)"
        />
      </template>
    </PageHeader>

    <!-- ── Your company ────────────────────────────────────────────────────── -->
    <div v-if="partyLoading" class="flex justify-center py-8">
      <LoadingSpinner />
    </div>
    <p v-else-if="!members?.length" class="font-fell italic text-muted-foreground">
      No party members yet.
    </p>
    <PeopleCompanyStrip
      v-else
      :entries="partyEntries"
      :group-portrait-url="groupPortraitUrl"
      :viewer-member-id="viewerMemberId"
      :show-hp="showHp"
      @open-member="selectedMember = $event"
      @open-companion="selectedCompanion = $event"
      @open-group="lightboxSrc = groupPortraitUrl"
    />

    <!-- ── People: the ledger ──────────────────────────────────────────────── -->
    <section v-if="npcs.length || npcsLoading">
      <div v-if="npcsLoading" class="flex justify-center py-8">
        <LoadingSpinner />
      </div>
      <div v-else class="lg:grid lg:grid-cols-[28rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div class="space-y-5">
          <header class="flex items-baseline gap-2.5 px-1">
            <h2 class="text-heading font-bold text-foreground">People</h2>
            <span class="font-fell text-caption italic text-muted-foreground">Dramatis personae</span>
          </header>

          <PeopleToolbar
            v-model:sort-by="effectiveSortBy"
            :sort-options="sortOptions"
            :places="places"
            :active-filter-count="activeFilterCount"
            @open-filters="filtersOpen = true"
          />

          <p v-if="readMapError" class="text-body italic text-muted-foreground">
            Your people could not be loaded. Try again in a moment.
          </p>
          <LoadingSpinner v-else-if="!ready" class="mx-auto" />
          <template v-else>
            <NewToYouStrip :items="newToYouItems" @turned="turnNewToYou" @open="openPerson" />

            <p v-if="!people.length" class="text-body italic text-muted-foreground">
              {{ ledger.length ? "No people match your filters." : "No one in the ledger yet." }}
            </p>
            <PeopleLedger
              v-else
              :groups="groups"
              :view="ui.playerPeopleView"
              :selected-id="isLg ? activeId : null"
              :get-rating="getRating"
              :is-new="isNpcNew"
              :place="place"
              @open="selectPerson"
            />
          </template>
        </div>

        <PeopleDetailPane
          v-if="isLg && activeNpc"
          :npc="activeNpc"
          :place="place(activeNpc)?.name ?? null"
          class="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto"
        />
      </div>
    </section>

    <PeopleFilterSheet
      v-model:open="filtersOpen"
      v-model:sort-by="effectiveSortBy"
      :sort-options="sortOptions"
      :places="places"
      :result-count="people.length"
    />

    <!-- ── Party member lightbox ───────────────────────────────────────────── -->
    <PartyMemberLightbox :member="selectedMember" @close="closeMember" />

    <!-- ── NPC lightbox ────────────────────────────────────────────────────── -->
    <PlayerNpcLightbox :npc="isLg ? null : lightboxNpc" :place="lightboxNpc ? (place(lightboxNpc)?.name ?? null) : null" @close="lightboxNpc = null" />

    <!-- ── Companion lightbox ──────────────────────────────────────────────── -->
    <PlayerPartyCompanionLightbox
      :companion="selectedCompanion"
      :owner-name="selectedCompanion ? ownerName(selectedCompanion) : ''"
      :viewer-member-id="viewerMemberId"
      @close="closeCompanion"
      @edit="handleEditCompanion"
    />

    <!-- ── Companion form side-sheet ───────────────────────────────────────── -->
    <CompanionForm
      v-if="companionFormOpen"
      :companion="editingCompanion ?? undefined"
      :party-members="members ?? []"
      :locked-owner-id="viewerMemberId"
      @saved="closeCompanionForm"
      @cancel="closeCompanionForm"
    />

  </div>

  <ImageLightbox :src="lightboxSrc" alt="Party group portrait" @close="lightboxSrc = null" />
</template>

<script setup lang="ts">
import PageHeader from "@/components/common/PageHeader.vue";
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconAdd } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import ImageLightbox from "@/components/common/ImageLightbox.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useParty } from "@/composables/party/useParty";
import { useSharedNpcs } from "@/composables/npcs/useNpcs";
import { useReadItems, useMarkRead } from "@/composables/play/useReadItems";
import { useCompanions } from "@/composables/encounters/useCompanions";
import { useNewToYou, toNewToYouItem } from "@/composables/play/useNewToYou";
import { usePlayerPeople } from "@/composables/play/usePlayerPeople";
import { useAbove } from "@/composables/useBreakpoint";
import PartyMemberLightbox from "@/components/player/PartyMemberLightbox.vue";
import PlayerNpcLightbox from "@/components/play/PlayerNpcLightbox.vue";
import PlayerPartyCompanionLightbox from "@/components/play/PlayerPartyCompanionLightbox.vue";
import CompanionForm from "@/components/party/CompanionForm.vue";
import NewToYouStrip from "@/components/play/people/NewToYouStrip.vue";
import PeopleCompanyStrip from "@/components/play/people/PeopleCompanyStrip.vue";
import PeopleDetailPane from "@/components/play/people/PeopleDetailPane.vue";
import PeopleFilterSheet from "@/components/play/people/PeopleFilterSheet.vue";
import PeopleLedger from "@/components/play/people/PeopleLedger.vue";
import PeopleToolbar from "@/components/play/people/PeopleToolbar.vue";
import { buildPartyEntries, type PartyEntry } from "@/components/play/people/peopleParty";
import type { Companion } from "@/types/companion.types";
import type { PartyMember } from "@/types/party.types";
import type { HealthVisibility } from "@/types/encounter.types";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const campaign = useCampaignStore();
const isLg = useAbove("lg");
const groupPortraitUrl = computed(() => campaign.activeCampaign?.group_portrait_url ?? null);
const lightboxSrc = ref<string | null>(null);
const viewerMemberId = computed(() =>
  ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : auth.linkedPartyMemberId,
);

const { data: members, isLoading: partyLoading } = useParty();
const { data: companions } = useCompanions();
const { data: allSharedNpcs, isLoading: npcsLoading } = useSharedNpcs();
const { isNew: isNpcNew, data: readMap, isError: readMapError } = useReadItems("npc");
const { mutate: markNpcRead } = useMarkRead();

// If no character is linked yet the player has not been seated at a party member,
// so they see no NPC visibility lists.
const npcs = computed(() => {
  const memberId = viewerMemberId.value;
  if (!memberId) return [];
  return (allSharedNpcs.value ?? []).filter(
    (npc) => Array.isArray(npc.player_visible_to) && npc.player_visible_to.includes(memberId),
  );
});

// ── People: new to you, then the ledger ──────────────────────────────────────
const { ready, entries: newToYouEntries, ledger, turn } = useNewToYou(npcs, readMap);
const {
  getRating,
  place,
  places,
  sortOptions,
  effectiveSortBy,
  activeFilterCount,
  groups,
  people,
} = usePlayerPeople(npcs, ledger);

const newToYouItems = computed(() =>
  newToYouEntries.value.map((entry) => toNewToYouItem(entry, place(entry.npc)?.name ?? null)),
);

function turnNewToYou(id: string) {
  turn(id);
  markNpcRead({ entityType: "npc", entityId: id });
}

const filtersOpen = ref(false);

// ── Opening a person ─────────────────────────────────────────────────────────
// From lg up the person opens in the side pane; below it, in a lightbox.
// Selection sticks: it is set once to the first ledger person, then only the
// player changes it. A selected person who drops out of view falls back to the
// first visible one.
const selectedId = ref<string | null>(null);
watch(
  () => [isLg.value, people.value[0]?.id ?? null] as const,
  ([lg, first]) => {
    if (lg && selectedId.value === null && first) selectedId.value = first;
  },
  { immediate: true },
);
const activeId = computed(() => {
  const id = selectedId.value;
  if (id && people.value.some((p) => p.id === id)) return id;
  return people.value[0]?.id ?? null;
});
const activeNpc = computed(() => npcs.value.find((n) => n.id === activeId.value) ?? null);
const lightboxNpc = ref<(typeof npcs.value)[number] | null>(null);

function selectPerson(id: string) {
  const npc = npcs.value.find((n) => n.id === id);
  if (!npc) return;
  markNpcRead({ entityType: "npc", entityId: id });
  selectedId.value = id;
  lightboxNpc.value = npc;
}
const openPerson = selectPerson;

// Open a person when navigated from a chat "View →" link (?npc=<id>)
watch(
  () => [route.query.npc, allSharedNpcs.value] as const,
  ([npcId]) => {
    if (!npcId || typeof npcId !== "string" || !allSharedNpcs.value) return;
    if (!allSharedNpcs.value.some((n) => n.id === npcId)) return;
    openPerson(npcId);
    const { npc: _npc, ...rest } = route.query;
    router.replace({ query: rest });
  },
  { immediate: true },
);

// ── Party ────────────────────────────────────────────────────────────────────
const partyEntries = computed(() =>
  buildPartyEntries(members.value ?? [], companions.value ?? [], viewerMemberId.value),
);

const healthVis = computed(
  () => (campaign.activeCampaign?.health_visibility as HealthVisibility) ?? "strategic",
);

function showHp(entry: PartyEntry): boolean {
  if (healthVis.value === "strategic") return true;
  return entry.kind === "member"
    ? entry.data.id === viewerMemberId.value
    : entry.data.owner_party_member_id === viewerMemberId.value;
}

const selectedMember = ref<PartyMember | null>(null);
function closeMember() { selectedMember.value = null; }

const selectedCompanion = ref<Companion | null>(null);
function closeCompanion() { selectedCompanion.value = null; }

function ownerName(c: Companion): string {
  if (!c.owner_party_member_id) return "";
  return members.value?.find((m) => m.id === c.owner_party_member_id)?.name ?? "";
}

// ── Companion form (players manage their own companions, #569) ───────────────
const companionFormOpen = ref(false);
const editingCompanion = ref<Companion | null>(null);

function openCompanionForm(companion: Companion | null) {
  editingCompanion.value = companion;
  companionFormOpen.value = true;
}

function closeCompanionForm() {
  companionFormOpen.value = false;
  editingCompanion.value = null;
}

function handleEditCompanion(companion: Companion) {
  closeCompanion();
  openCompanionForm(companion);
}
</script>
