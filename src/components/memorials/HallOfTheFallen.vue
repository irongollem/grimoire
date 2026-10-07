<template>
  <!--
    Always dark, whatever the viewer's setting (the maintainer: "indeed always darkmode this
    page"): the root sets the dark twin of the active theme's custom properties, so every
    token below resolves dark. The cards on the wall are paper and do not follow it.
  -->
  <section
    class="hall flex min-h-full shrink-0 flex-col gap-7 px-4 pb-20 pt-9 text-foreground md:px-10"
    :style="wallStyle"
    aria-label="Hall of the Fallen"
  >
    <slot name="before" />
    <HallHeader :epigraph="epigraph" :tally="tally" />

    <div v-if="query.isError.value" class="mx-auto max-w-md text-center text-body text-muted-foreground" role="alert">
      The wall could not be read. {{ toast.fromError(query.error.value, "Try again in a moment.") }}
    </div>
    <div v-else-if="query.isPending.value || !ready" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <template v-else>
      <!-- A name that outlives a membership: ask once whether to keep it. -->
      <div v-if="prompts.length > 0" class="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <HallKeepPrompt
          v-for="m in prompts"
          :key="m.id"
          :memorial="m"
          :busy="keep.isPending.value || letGo.isPending.value"
          @keep="answer(keep, m)"
          @let-go="answer(letGo, m)"
        />
      </div>

      <!-- Nobody yet: one unlit candle. -->
      <div v-if="scoped.length === 0" class="mx-auto flex flex-col items-center gap-2 py-10 text-center">
        <MemorialCandle :lit="false" class="hall-empty-candle" />
        <p class="text-heading-sm text-foreground">No names on the wall</p>
        <p class="font-fell text-lg italic text-muted-foreground">May it stay that way.</p>
      </div>

      <template v-else>
        <div class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
          <div class="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Campaign">
            <template v-if="scope === 'dm'">
              <AppButton
                v-for="o in options"
                :key="o.id"
                variant="subtle"
                size="sm"
                :active="campaign === o.id"
                :aria-pressed="campaign === o.id"
                :label="o.name"
                @click="ui.hallCampaign = o.id"
              />
              <AppButton
                variant="subtle"
                size="sm"
                :active="campaign === 'all'"
                :aria-pressed="campaign === 'all'"
                label="All my campaigns"
                @click="ui.hallCampaign = 'all'"
              />
            </template>
            <template v-else>
              <AppButton
                variant="subtle"
                size="sm"
                :active="campaign === 'all'"
                :aria-pressed="campaign === 'all'"
                label="All campaigns"
                @click="ui.hallCampaign = 'all'"
              />
              <AppButton
                v-for="o in options"
                :key="o.id"
                variant="subtle"
                size="sm"
                :active="campaign === o.id"
                :aria-pressed="campaign === o.id"
                :label="o.name"
                @click="ui.hallCampaign = o.id"
              />
            </template>
          </div>
          <SegmentedControl v-model="ui.hallKind" :options="KIND_OPTIONS" size="sm" aria-label="Kind" />
          <AppButton v-if="ui.hasHallFiltersActive" variant="ghost" size="sm" label="Clear" @click="ui.resetHallFilters()" />
        </div>

        <p v-if="shown.length === 0" class="text-center text-body italic text-muted-foreground">
          Nobody on the wall matches these filters.
        </p>

        <!-- Player wall: mine first, then the people who stood beside me. The DM's is one grid. -->
        <template v-else>
        <section
          v-for="section in sections"
          :key="section.key"
          :aria-labelledby="section.title ? `hall-${section.key}` : undefined"
          class="flex flex-col gap-5"
        >
          <h2 v-if="section.title" :id="`hall-${section.key}`" class="hall-section-head text-primary">{{ section.title }}</h2>
          <ul class="hall-grid" :class="{ 'hall-grid-phone': isPhone }">
            <li v-for="m in section.items" :key="m.id">
              <HallCell
                v-bind="slotProps(m)"
                :phone="isPhone"
                @flip="toggleFlip(m.id)"
                @light-candle="light(m)"
                @edit-words="wordsFor = m"
                @edit-account="emit('edit-account', m)"
                @open="openOnPhone(m)"
              />
            </li>
          </ul>
        </section>
        </template>
      </template>
    </template>

    <!-- Phone: a tap opens the card at full size, where it can be turned over. -->
    <AppModal
      :open="isPhone && openMemorial !== null"
      size="sm"
      panel-class="torn-bare border-0 bg-transparent shadow-none"
      :label="openMemorial ? `${openMemorial.character_name}'s memorial card` : 'Memorial card'"
      @close="openId = null"
    >
      <div v-if="openMemorial" class="flex flex-col items-center gap-3 p-2" :style="darkStyle">
        <HallCardSlot v-bind="slotProps(openMemorial)" @flip="toggleFlip(openMemorial.id)" @light-candle="light(openMemorial)" @edit-words="wordsFor = openMemorial" @edit-account="emit('edit-account', openMemorial)" />
        <AppButton variant="outline" size="md" label="Close" @click="openId = null" />
      </div>
    </AppModal>

    <MemorialWordsDialog :memorial="wordsFor" @close="wordsFor = null" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { UseMutationReturnType } from "@tanstack/vue-query";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import HallCardSlot from "@/components/memorials/HallCardSlot.vue";
import HallCell from "@/components/memorials/HallCell.vue";
import HallHeader from "@/components/memorials/HallHeader.vue";
import HallKeepPrompt from "@/components/memorials/HallKeepPrompt.vue";
import MemorialCandle from "@/components/memorials/MemorialCandle.vue";
import MemorialWordsDialog from "@/components/memorials/MemorialWordsDialog.vue";
import { useAllDmCampaigns, usePlayerCampaigns } from "@/composables/campaign/useCampaigns";
import {
  useKeepMemorial,
  useLetGoMemorial,
  useLightCandle,
  useMyMournerRows,
  useWallMemorials,
  type MournerTarget,
} from "@/composables/memorials/useMemorials";
import { artUrl } from "@/lib/assets/artUrl";
import { useIsMobile } from "@/composables/useBreakpoint";
import { useTheme } from "@/composables/useTheme";
import { darkTwinStyle } from "@/lib/themeRuntime";
import { useToast } from "@/composables/useToast";
import { effectiveHallCampaign, filterHall, hallCampaignOptions } from "@/lib/memorials/hallView";
import { candleCounts, hiddenFromMe, onTheWall, pendingKeepPrompts, splitWall, wallTally } from "@/lib/memorials/wall";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import type { CharacterMemorial, MemorialKind, MemorialMourner } from "@/types/memorial.types";

/**
 * The Hall of the Fallen (#982): every memorial the viewer may see, on a stone wall, one
 * card each. `scope="player"` is the player portal's wall (mine first, then those who stood
 * beside me, plus the keep / let-go question after leaving a campaign); `scope="dm"` is the
 * DM's, a single grid over the campaigns they run.
 *
 * Below `md` the grid shows fronts only, two to a row at reduced scale; a tap opens the card
 * at full size in a modal, where it turns over.
 *
 * Editing the DM's account is not done here: `edit-account` is re-emitted for whoever hosts
 * the wall to open the account dialog.
 */
const props = defineProps<{ scope: "player" | "dm" }>();
const emit = defineEmits<{ "edit-account": [memorial: CharacterMemorial] }>();

const KIND_OPTIONS: ReadonlyArray<{ value: MemorialKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "fallen", label: "Fallen" },
  { value: "retired", label: "Retired" },
];

const auth = useAuthStore();
const campaignStore = useCampaignStore();
const ui = useUiStore();
const toast = useToast();
const { activeThemeId } = useTheme();
const darkStyle = computed(() => darkTwinStyle(activeThemeId.value));
// The stone texture is a CDN-served art asset, so its URL goes through artUrl() and reaches the CSS as a variable.
const wallStyle = computed(() => ({ ...darkStyle.value, "--hall-stone": `url("${artUrl("/assets/memorial/stone.jpg")}")` }));
const isPhone = useIsMobile();

const query = useWallMemorials();
const myMourners = useMyMournerRows();
const playerCampaigns = usePlayerCampaigns();
const dmCampaigns = useAllDmCampaigns({ enabled: () => props.scope === "dm" });
const lightCandle = useLightCandle();
const keep = useKeepMemorial();
const letGo = useLetGoMemorial();

const userId = computed(() => auth.user?.id ?? null);

/** What the wall needs to know about the viewer before it can place anyone on it. */
const ready = computed(() =>
  props.scope === "dm"
    ? dmCampaigns.data.value !== undefined
    : playerCampaigns.data.value !== undefined && myMourners.data.value !== undefined,
);

const mine = computed<readonly MemorialMourner[]>(() => myMourners.data.value ?? []);
const mineByMemorial = computed(() => new Map(mine.value.map((r) => [r.memorial_id, r])));
const dmCampaignIds = computed(() => new Set((dmCampaigns.data.value ?? []).map((c) => c.id)));

const wall = computed(() => onTheWall(query.data.value?.memorials ?? []));
const counts = computed(() => candleCounts(query.data.value?.mourners ?? []));
const litByMe = computed(
  () => new Set(mine.value.filter((r) => r.candle_lit_at !== null).map((r) => r.memorial_id)),
);

/** Everything on the wall this viewer should see, before the filters: the DM's wall is their own campaigns. */
const scoped = computed(() =>
  wall.value.filter((m) => {
    if (hiddenFromMe(m, mineByMemorial.value.get(m.id))) return false;
    return props.scope === "dm" ? dmCampaignIds.value.has(m.campaign_id) : true;
  }),
);

const options = computed(() => hallCampaignOptions(scoped.value));
const campaign = computed(() =>
  effectiveHallCampaign(ui.hallCampaign, props.scope, campaignStore.activeCampaignId, options.value),
);
const shown = computed(() => filterHall(scoped.value, campaign.value, ui.hallKind));
const split = computed(() => splitWall(shown.value, userId.value));
const tally = computed(() => wallTally(shown.value));

const epigraph = computed(() =>
  props.scope === "dm" ? "Those who fell at your table, and those who left it." : "Not lost, but gone before.",
);

/** Memorials of mine in campaigns I have left, awaiting an answer. Players only. */
const prompts = computed(() => {
  const uid = userId.value;
  const campaigns = playerCampaigns.data.value;
  if (props.scope !== "player" || uid === null || campaigns === undefined) return [];
  return pendingKeepPrompts(wall.value, mine.value, new Set(campaigns.map((c) => c.id)), uid);
});

function answer(mutation: UseMutationReturnType<void, Error, MournerTarget, unknown>, m: CharacterMemorial) {
  mutation.mutate(
    { memorialId: m.id, campaignId: m.campaign_id },
    { onError: (e) => toast.error(toast.fromError(e, "Could not save your answer.")) },
  );
}

function light(m: CharacterMemorial) {
  lightCandle.mutate(
    { memorialId: m.id, campaignId: m.campaign_id },
    { onError: (e) => toast.error(toast.fromError(e, "Could not light the candle.")) },
  );
}

function viewerFor(m: CharacterMemorial): "owner" | "dm" | "other" {
  if (userId.value !== null && m.owner_user_id === userId.value) return "owner";
  return dmCampaignIds.value.has(m.campaign_id) ? "dm" : "other";
}

// One flipped set for the whole wall: a card is turned or it is not, by id.
const flipped = ref(new Set<string>());
function toggleFlip(id: string) {
  if (flipped.value.has(id)) flipped.value.delete(id);
  else flipped.value.add(id);
}

const wordsFor = ref<CharacterMemorial | null>(null);

function slotProps(m: CharacterMemorial) {
  return {
    memorial: m,
    viewer: viewerFor(m),
    candleCount: counts.value.get(m.id) ?? 0,
    litByMe: litByMe.value.has(m.id),
    flipped: flipped.value.has(m.id),
  };
}

// The phone's open card.
const openId = ref<string | null>(null);
const openMemorial = computed(() => scoped.value.find((m) => m.id === openId.value) ?? null);

function openOnPhone(m: CharacterMemorial) {
  flipped.value.delete(m.id);
  openId.value = m.id;
}

const sections = computed(() => {
  if (props.scope === "dm") return [{ key: "all", title: null, items: shown.value }];
  return [
    { key: "mine", title: "Your champions", items: split.value.mine },
    { key: "beside", title: "Who stood beside you", items: split.value.beside },
  ].filter((section) => section.items.length > 0);
});
</script>

<style scoped>
/* The stone wall: a tileable stone texture under a warm glow from the candles at the top. */
.hall {
  background-color: var(--background);
  background-image:
    radial-gradient(ellipse 60% 28rem at 50% 0%, rgb(226 170 72 / 0.2), transparent 75%),
    var(--hall-stone);
  background-size: auto, 24rem 24rem;
}
.hall-section-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  margin: 0;
  font-family: var(--font-cinzel);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.hall-section-head::before,
.hall-section-head::after {
  content: "";
  width: 2.125rem;
  height: 1px;
  background: currentColor;
  opacity: 0.45;
}
.hall-grid {
  display: grid;
  /* auto-fit, not auto-fill: empty tracks collapse, so a short row centres under the header. */
  grid-template-columns: repeat(auto-fit, 16.5rem);
  justify-content: center;
  gap: 1.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.hall-grid-phone {
  grid-template-columns: repeat(2, minmax(0, 10.875rem));
  gap: 0.625rem;
}
.hall-empty-candle { --candle-h: 6rem; }

</style>
