<script setup lang="ts">
import { computed } from "vue";
import PageHeader from "@/components/common/PageHeader.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import DowntimeResolvePanel from "@/components/downtime/DowntimeResolvePanel.vue";
import DeckBacksPanel from "@/components/downtime/DeckBacksPanel.vue";
import DowntimeOutcomeVignette from "@/components/downtime/DowntimeOutcomeVignette.vue";
import GrantDowntimeButton from "@/components/downtime/GrantDowntimeButton.vue";
import RuleDisabledNotice from "@/components/common/RuleDisabledNotice.vue";
import { useIsRuleEnabled } from "@/composables/useOptionalRules";
import { useParty } from "@/composables/useParty";
import { useNpcs } from "@/composables/useNpcs";
import { useDowntimeDraws, useDowntimeOutcomes, useDeckBacks } from "@/composables/useDowntime";
import { useUiStore } from "@/stores/ui";
import { DOWNTIME_DRAW_STATUSES, DOWNTIME_DRAW_STATUS_LABELS } from "@/types/downtime.types";
import type { DowntimeDraw } from "@/types/downtime.types";

const ui = useUiStore();
// Hidden from the sidebar when off, but a bookmarked URL still lands here.
const isEnabled = useIsRuleEnabled("downtime");
const { data: party, isPending: partyPending } = useParty();
const { data: npcs } = useNpcs();
const { data: draws } = useDowntimeDraws();
const { data: outcomes } = useDowntimeOutcomes();
const { data: backs } = useDeckBacks();

const filterStatus = computed({
  get: () => ui.downtimeFilterStatus,
  set: (v) => (ui.downtimeFilterStatus = v),
});
const filterCharacter = computed({
  get: () => ui.downtimeFilterCharacter,
  set: (v) => (ui.downtimeFilterCharacter = v),
});

/** A character deleted out from under a draw must read as absent. */
function memberName(id: string): string {
  return party.value?.find((m) => m.id === id)?.name ?? "??? (removed)";
}

const visibleDraws = computed<DowntimeDraw[]>(() =>
  (draws.value ?? []).filter(
    (d) =>
      (filterStatus.value === "all" || d.status === filterStatus.value) &&
      (filterCharacter.value === "" || d.party_member_id === filterCharacter.value),
  ),
);

const pendingDraws = computed(() => visibleDraws.value.filter((d) => d.status === "pending"));

/** Resolved draws, newest first, paired with their outcome. */
const resolvedFeed = computed(() =>
  (outcomes.value ?? [])
    .map((outcome) => {
      const draw = (draws.value ?? []).find((d) => d.id === outcome.draw_id);
      return draw ? { outcome, draw } : null;
    })
    .filter((x): x is { outcome: NonNullable<typeof x>["outcome"]; draw: DowntimeDraw } => x !== null)
    .filter(
      ({ draw }) => filterCharacter.value === "" || draw.party_member_id === filterCharacter.value,
    ),
);

function rewardName(rewardType: string | null, rewardId: string | null): string | null {
  if (rewardType !== "npc" || !rewardId) return null;
  return npcs.value?.find((n) => n.id === rewardId)?.name ?? null;
}

function rewardHref(rewardType: string | null, rewardId: string | null): string | null {
  if (rewardType !== "npc" || !rewardId) return null;
  return `/npcs/${rewardId}`;
}
</script>

<template>
  <RuleDisabledNotice
    v-if="!isEnabled"
    module-name="The Interlude"
    hint="Enable it in Campaign Settings → Rules to grant downtime draws."
  />

  <div v-else class="mx-auto max-w-5xl px-4 py-6">
    <PageHeader
      title="The Interlude"
      description="What the party did between the dungeon and the next session."
    >
      <template #title-suffix>
        <ManualHelpLink page="the-interlude-downtime" />
      </template>
    </PageHeader>

    <!-- Grant credits -->
    <section class="mt-6 rounded-lg border border-border bg-card p-4">
      <h2 class="text-heading-sm font-semibold">Grant downtime</h2>
      <p class="mt-1 text-caption-sm text-muted-foreground">
        A draw is a gift you give when the story says there is a lull. One credit, one turn of
        the deck.
      </p>
      <!-- "Still loading" and "there is nobody" are different facts. Claiming the
           campaign has no characters while the query is in flight is a lie the
           user can see: they land here, read "no characters", and only a refresh
           (warm cache) proves otherwise. -->
      <p v-if="partyPending" class="mt-3 text-caption-sm text-muted-foreground">Loading the party…</p>
      <ul v-else-if="party && party.length > 0" class="mt-3 space-y-1">
        <li
          v-for="member in party"
          :key="member.id"
          class="flex items-center justify-between rounded border border-border px-2 py-1"
        >
          <span class="text-body">{{ member.name }}</span>
          <GrantDowntimeButton :party-member-id="member.id" :party-member-name="member.name" />
        </li>
      </ul>
      <p v-else class="mt-3 text-caption-sm text-muted-foreground">No characters in this campaign yet.</p>
    </section>

    <!-- Pending draws: the batch resolution board.
         The filters live INSIDE this section, on the heading row — they filter
         this list and nothing else, so floating them above the heading (and
         outside any card) left them reading as page furniture. -->
    <section class="mt-6 rounded-lg border border-border bg-card p-4">
      <h2 class="text-heading-sm font-semibold">
        Awaiting you
        <span class="text-caption-sm font-normal text-muted-foreground">
          ({{ pendingDraws.length }})
        </span>
      </h2>

      <!-- A filter bar under its section heading, not beside it: the selects carry
           stacked labels, so putting them on the heading row made the row two
           controls tall and left the heading floating in dead space. -->
      <div class="mt-3 flex flex-wrap items-end gap-2 border-b border-border pb-3">
        <div>
          <label for="downtime-filter-status" class="mb-1 block text-eyebrow font-medium">
            Status
          </label>
          <AppSelect id="downtime-filter-status" v-model="filterStatus" size="body" weight="normal">
            <option value="all">All</option>
            <option v-for="s in DOWNTIME_DRAW_STATUSES" :key="s" :value="s">
              {{ DOWNTIME_DRAW_STATUS_LABELS[s] }}
            </option>
          </AppSelect>
        </div>

        <div>
          <label for="downtime-filter-character" class="mb-1 block text-eyebrow font-medium">
            Character
          </label>
          <AppSelect id="downtime-filter-character" v-model="filterCharacter" size="body" weight="normal">
            <option value="">Everyone</option>
            <option v-for="m in party ?? []" :key="m.id" :value="m.id">{{ m.name }}</option>
          </AppSelect>
        </div>

        <AppButton
          v-if="ui.downtimeHasActiveFilters"
          variant="subtle"
          size="sm"
          label="Clear"
          @click="ui.resetDowntimeFilters()"
        />
      </div>

      <p v-if="pendingDraws.length === 0" class="mt-3 text-caption-sm text-muted-foreground">
        Nothing pending. Grant a credit and your players can spend it between sessions.
      </p>
      <div v-else class="mt-3 space-y-4">
        <DowntimeResolvePanel
          v-for="draw in pendingDraws"
          :key="draw.id"
          :draw="draw"
          :member-name="memberName(draw.party_member_id)"
          :backs="backs ?? []"
        />
      </div>
    </section>

    <!-- Prep -->
    <div class="mt-8">
      <DeckBacksPanel />
    </div>

    <!-- What has already happened -->
    <section v-if="resolvedFeed.length > 0" class="mt-8">
      <h2 class="text-heading-sm font-semibold">Resolved</h2>
      <div class="mt-3 space-y-3">
        <DowntimeOutcomeVignette
          v-for="{ outcome, draw } in resolvedFeed"
          :key="outcome.id"
          :outcome="outcome"
          :activity-key="draw.activity_key"
          :reward-name="rewardName(outcome.reward_type, outcome.reward_id)"
          :reward-href="rewardHref(outcome.reward_type, outcome.reward_id)"
        />
      </div>
    </section>
  </div>
</template>
