<template>
  <PageHeader :title="beat?.title || 'Quest beat'" :description="eyebrowText">
    <template #actions>
      <template v-if="beat">
        <AppButton label="Preview as players" size="sm" variant="subtle" @click="previewOpen = true" />
        <AppButton
          v-if="beat.visibility !== 'revealed'"
          :label="beat.visibility === 'rumored' ? 'Reveal fully' : 'Reveal to players'"
          size="sm"
          :loading="revealing"
          @click="revealBeat"
        />
      </template>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16"><LoadingSpinner /></div>
    <div v-else-if="beat" class="mx-auto flex w-full max-w-6xl flex-col gap-3 pb-12">
      <AppButton :to="returnTo" :label="returnLabel" size="sm" variant="subtle" class="self-start" />

      <div class="grid min-w-0 gap-3 lg:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-3">
          <section class="rounded-xl border border-border bg-card p-3" aria-label="Beat">
            <header class="flex items-center gap-2">
              <h3 class="font-cinzel text-sm font-bold text-foreground">Beat</h3>
              <span v-if="prepGapCount" class="ml-auto rounded bg-tone-caution/15 px-1.5 py-0.5 text-label uppercase text-ink-caution">
                {{ prepGapCount }} prep gap{{ prepGapCount === 1 ? '' : 's' }}
              </span>
            </header>

            <div class="mt-2 space-y-1.5">
              <div class="flex min-w-0 items-center gap-2 rounded-md border border-border p-2 text-caption">
                <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><IconQuest class="h-3.5 w-3.5" /></span>
                <div class="min-w-0 flex-1">
                  <p class="font-cinzel text-label-lg font-bold text-foreground">Kind</p>
                  <p class="truncate text-muted-foreground">{{ QUEST_BEAT_KINDS.join(' · ') }}</p>
                </div>
                <AppSelect v-model="kindModel" class="w-36 shrink-0" aria-label="Kind">
                  <option v-for="option in kindOptions" :key="option" :value="option">{{ kindLabel(option) }}</option>
                </AppSelect>
              </div>

              <div class="flex min-w-0 items-center gap-2 rounded-md border border-border p-2 text-caption">
                <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><IconLocation class="h-3.5 w-3.5" /></span>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-cinzel text-label-lg font-bold text-foreground">{{ stagedLocationName || "Not staged" }}</p>
                  <p class="truncate text-muted-foreground">staged at · {{ stagedSiteCaption }}</p>
                </div>
                <EntityCombobox
                  v-if="editingLocation"
                  v-model="stagedLocationId"
                  class="w-48 shrink-0"
                  :options="locationOptions"
                  placeholder="Where does this beat happen?"
                >
                  <template #option="{ opt }">
                    <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 0.75}rem` }">{{ opt.name }}</span>
                  </template>
                </EntityCombobox>
                <AppButton v-else label="Change" size="xs" variant="subtle" @click="editingLocation = true" />
              </div>

              <div class="flex min-w-0 items-center gap-2 rounded-md border border-border p-2 text-caption">
                <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><IconReveal class="h-3.5 w-3.5" /></span>
                <div class="min-w-0 flex-1">
                  <p class="font-cinzel text-label-lg font-bold text-foreground">Visibility · {{ VISIBILITY_LABELS[beat.visibility] }}</p>
                  <p class="truncate text-muted-foreground">{{ VISIBILITY_CAPTIONS[beat.visibility] }}</p>
                </div>
                <AppSelect v-if="editingVisibility" v-model="visibilityModel" class="w-36 shrink-0" aria-label="Player visibility">
                  <option value="hidden">Hidden</option>
                  <option value="rumored">Rumored</option>
                  <option value="revealed">Revealed</option>
                </AppSelect>
                <AppButton v-else label="Edit" size="xs" variant="subtle" @click="editingVisibility = true" />
              </div>
            </div>

            <div v-if="beat.read_aloud" class="mt-3 border-l-2 border-primary/50 pl-3 py-1 font-fell text-body italic text-foreground">
              <RichTextViewer :content="beat.read_aloud" />
            </div>

            <div class="mt-3">
              <QuestBeatFields :key="beat.id" :beat="beat" />
            </div>
            <p v-if="fieldsSaveError" role="alert" class="mt-1 text-caption text-destructive">{{ fieldsSaveError }}</p>
          </section>

          <QuestBeatAttachmentsPanel :beat="beat" :attachments="attachments" />
          <QuestBeatSitePanel :beat="beat" />
        </div>

        <div class="flex min-w-0 flex-col gap-3">
          <QuestBeatRoutesPanel :beat="beat" :edges="edgesQuery.data.value ?? []" :beats="beatsQuery.data.value ?? []" />
          <QuestPayoffPanel
            :beat="beat"
            :edges="edgesQuery.data.value ?? []"
            :beats="beatsQuery.data.value ?? []"
            :consequences="consequencesQuery.data.value ?? []"
            :loot="loot"
          />
        </div>
      </div>
    </div>
    <p v-else class="py-16 text-center text-body text-muted-foreground">This beat is missing or unavailable.</p>

    <QuestPlayerPreviewDrawer
      v-if="previewOpen && beat"
      :quest-id="questId"
      :visible-to="quest?.player_visible_to ?? []"
      :selected-beat-id="beat.id"
      :saved-visibility="beat.visibility"
      @close="previewOpen = false"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useQuest } from "@/composables/quests/useQuests";
import {
  useQuestBeat,
  useQuestBeatAttachmentSummaries,
  useQuestBeatEdges,
  useQuestBeats,
  useQuestConsequences,
  useUpdateQuestBeat,
  useCampaignLiveQuests,
  useLootPlacements,
} from "@/composables/quests/useQuestFlow";
import { useQuestThreads } from "@/composables/quests/useQuestThreads";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useSiteStructure } from "@/composables/locations/useSiteStructure";
import { useConfirm } from "@/composables/useConfirm";
import { questReturnLabel, questSurfaceReturnTo, safeQuestReturnTo } from "@/lib/quests/navigation";
import { isSiteType } from "@/lib/locations/tiers";
import { threadBadge } from "@/lib/quests/threads";
import { deriveQuestBeatPrepGaps } from "@/lib/quests/presentation";
import {
  QUEST_BEAT_KINDS,
  QUEST_BEAT_KIND_LABELS,
  type QuestBeatUpdate,
  type QuestBeatVisibility,
} from "@/types/quest.types";
import type { Location } from "@/types/location.types";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import QuestBeatAttachmentsPanel from "@/components/quests/QuestBeatAttachmentsPanel.vue";
import QuestBeatFields from "@/components/quests/QuestBeatFields.vue";
import QuestBeatSitePanel from "@/components/quests/QuestBeatSitePanel.vue";
import QuestBeatRoutesPanel from "@/components/quests/QuestBeatRoutesPanel.vue";
import QuestPayoffPanel from "@/components/quests/QuestPayoffPanel.vue";
import QuestPlayerPreviewDrawer from "@/components/quests/QuestPlayerPreviewDrawer.vue";
import { IconLocation, IconQuest, IconReveal } from "@/lib/icons";

type LocationOption = Location & { depth: number };

const route = useRoute();
const { confirm } = useConfirm();
const questId = computed(() => route.params.id as string);
const beatId = computed(() => route.params.beatId as string);
const { data: quest, isLoading: questLoading } = useQuest(questId);
const beatQuery = useQuestBeat(beatId);
const beatsQuery = useQuestBeats(questId);
const edgesQuery = useQuestBeatEdges(questId);
const attachmentsQuery = useQuestBeatAttachmentSummaries(questId);
const lootQuery = useLootPlacements({ questId });
const consequencesQuery = useQuestConsequences(questId);
const liveQuestsQuery = useCampaignLiveQuests();
const threadsQuery = useQuestThreads(questId);
const { locationOptions } = useLocationTree();
const updateBeat = useUpdateQuestBeat();

const beat = computed(() => beatQuery.data.value?.quest_id === questId.value ? beatQuery.data.value : null);
const attachments = computed(() => (attachmentsQuery.data.value ?? []).filter((row) => row.beat_id === beatId.value));
const loot = computed(() => (lootQuery.data.value ?? []).filter((row) => row.beat_id === beatId.value));
const isLoading = computed(() => questLoading.value || beatQuery.isLoading.value || attachmentsQuery.isLoading.value || lootQuery.isLoading.value);
const returnTo = computed(() => safeQuestReturnTo(route.query.returnTo, questSurfaceReturnTo(questId.value, beatId.value, "work")));
const returnLabel = computed(() => questReturnLabel(returnTo.value));

// ── Eyebrow: kind · thread letter (only when a live thread stands here) · party here|— ──

const threadHere = computed(() => (liveQuestsQuery.data.value ?? [])
  .find((live) => live.quest_id === questId.value && live.beat_id === beatId.value));
const threadLetterHere = computed(() => threadHere.value
  ? threadBadge(threadsQuery.data.value ?? [], threadHere.value.thread_id)?.letter ?? null
  : null);
function kindLabel(option: string) {
  return QUEST_BEAT_KIND_LABELS[option as (typeof QUEST_BEAT_KINDS)[number]] ?? option;
}
const eyebrowText = computed(() => {
  if (!beat.value) return undefined;
  const parts = [kindLabel(beat.value.kind)];
  if (threadLetterHere.value) parts.push(`Thread ${threadLetterHere.value}`);
  parts.push(threadHere.value ? "party is here" : "—");
  return parts.join(" · ");
});

// ── Beat panel: kind, staged location, visibility — each saved immediately ──

const kindOptions = computed<string[]>(() => {
  const current = beat.value?.kind ?? "neutral";
  return (QUEST_BEAT_KINDS as readonly string[]).includes(current) ? [...QUEST_BEAT_KINDS] : [...QUEST_BEAT_KINDS, current];
});
const kindModel = computed<string>({
  get: () => beat.value?.kind || "neutral",
  set: (next) => { if (beat.value && next !== beat.value.kind) void saveBeatField({ kind: next }); },
});

const VISIBILITY_LABELS: Record<QuestBeatVisibility, string> = { hidden: "hidden", rumored: "rumored", revealed: "revealed" };
const VISIBILITY_CAPTIONS: Record<QuestBeatVisibility, string> = {
  hidden: "Players do not see this beat at all",
  rumored: "Players see the rumour text, not the beat",
  revealed: "Players see the beat itself",
};
const editingVisibility = ref(false);
const visibilityModel = computed<QuestBeatVisibility>({
  get: () => beat.value?.visibility ?? "hidden",
  set: (next) => {
    editingVisibility.value = false;
    if (beat.value && next !== beat.value.visibility) void saveBeatField({ visibility: next });
  },
});

const editingLocation = ref(false);
const stagedLocationId = computed<string>({
  get: () => beat.value?.staged_at_location_id ?? "",
  set: (next) => {
    editingLocation.value = false;
    if (beat.value && (next || null) !== beat.value.staged_at_location_id) void saveBeatField({ staged_at_location_id: next || null });
  },
});
const stagedLocation = computed(() => beat.value?.staged_at_location_id
  ? locationOptions.value.find((candidate) => candidate.id === beat.value!.staged_at_location_id)
  : undefined);
const stagedLocationName = computed(() => stagedLocation.value?.name ?? "");
// A beat can now be staged directly at a room (#868 S12) — the site itself
// is the room's parent; `staged_at_location_id` has always accepted any
// location, a room included. `QuestBeatSitePanel` (below) is the full "Opens
// at" surface for that case; this caption only needs to stop calling it
// "not a site" when it plainly is one, one level up.
const resolvedSite = computed(() => {
  const loc = stagedLocation.value;
  if (!loc) return null;
  if (isSiteType(loc.location_type)) return loc;
  return loc.parent_id ? locationOptions.value.find((candidate) => candidate.id === loc.parent_id) ?? null : null;
});
const stagedSiteCaption = computed(() => {
  const loc = stagedLocation.value;
  if (!loc) return "nowhere yet";
  const site = resolvedSite.value;
  if (!site) return "not a site — no room surface";
  const roomCount = locationOptions.value.filter((candidate) => candidate.parent_id === site.id && candidate.location_type === "room").length;
  const rooms = `${roomCount} room${roomCount === 1 ? "" : "s"}`;
  return loc.id === site.id ? `site: ${rooms}` : `opens at this room in ${site.name} — ${rooms}`;
});
const { readiness: siteReadiness } = useSiteStructure(resolvedSite);

const fieldsSaveError = ref("");
async function saveBeatField(update: QuestBeatUpdate) {
  if (!beat.value) return;
  fieldsSaveError.value = "";
  try {
    await updateBeat.mutateAsync({ id: beat.value.id, questId: beat.value.quest_id, update });
  } catch (caught) {
    fieldsSaveError.value = caught instanceof Error ? caught.message : "Could not save this change";
  }
}
watch(() => beat.value?.id, () => { editingLocation.value = false; editingVisibility.value = false; });

// ── Prep gaps ──────────────────────────────────────────────────────────────

const prepGapCount = computed(() => beat.value
  ? deriveQuestBeatPrepGaps(beat.value, attachments.value, { site: resolvedSite.value ? siteReadiness.value : undefined }).length
  : 0);

// ── Reveal + preview ─────────────────────────────────────────────────────────

const revealing = ref(false);
const previewOpen = ref(false);

async function revealBeat() {
  if (!beat.value) return;
  if (!(await confirm(`Reveal "${beat.value.title}" to players?`))) return;
  revealing.value = true;
  try {
    await updateBeat.mutateAsync({
      id: beat.value.id,
      questId: beat.value.quest_id,
      expectedUpdatedAt: beat.value.updated_at,
      update: { visibility: "revealed" },
    });
  } catch (caught) {
    fieldsSaveError.value = caught instanceof Error ? caught.message : "The player reveal could not be changed";
  } finally {
    revealing.value = false;
  }
}
</script>
