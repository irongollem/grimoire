<template>
  <div class="flex flex-col gap-4">
    <!-- Top bar -->
    <EntityEditorActionBar
      :title="title"
      title-placeholder="Quest title…"
      :exists="!isNew"
      :can-save="!!title.trim()"
      :saving="saving"
      :deleting="deleting"
      :error="saveError"
      :visible-to="playerVisibleTo"
      @update:title="title = $event"
      @update:visible-to="playerVisibleTo = $event"
      @save="save"
      @cancel="onCancel"
      @delete="remove"
    >
      <template #controls>
        <select
          v-model="status"
          class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
          :style="{ color: QUEST_STATUS_COLORS[status] }"
        >
          <option v-for="s in QUEST_STATUSES" :key="s" :value="s">
            {{ QUEST_STATUS_LABELS[s] }}
          </option>
        </select>
      </template>
      <template #extra-actions>
        <button
          v-if="!isNew"
          type="button"
          :disabled="sendingToScriptorium"
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
          @click="sendToScriptorium"
        >
          <IconPopulate class="h-3.5 w-3.5" />
          {{ sendingToScriptorium ? "Sending…" : "Scriptorium" }}
        </button>
      </template>
    </EntityEditorActionBar>

    <!-- Two-column layout -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Left: meta + notes -->
      <div class="lg:col-span-2 flex flex-col gap-4">
        <!-- Summary -->
        <div class="flex flex-col gap-1.5">
          <label
            class="text-label-lg font-semibold text-muted-foreground"
            >Summary</label
          >
          <input
            v-model="summary"
            placeholder="A short description of the quest…"
            class="w-full bg-card border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <!-- Metadata grid -->
        <QuestMetadataGrid
          v-model:giver-npc-id="giverNpcId"
          v-model:location-id="locationId"
          v-model:parent-quest-id="parentQuestId"
          v-model:rewards="rewards"
          :npcs="npcs ?? []"
          :locations="locations ?? []"
          :parent-quest-options="parentCandidateOptions"
          :is-new="isNew"
          :pp="rewardPp"
          :gp="rewardGp"
          :ep="rewardEp"
          :sp="rewardSp"
          :cp="rewardCp"
          @update:pp="rewardPp = $event"
          @update:gp="rewardGp = $event"
          @update:ep="rewardEp = $event"
          @update:sp="rewardSp = $event"
          @update:cp="rewardCp = $event"
          @drop-currency-to-chat="dropCurrencyToChat"
        />

        <!-- Tags -->
        <TagInput v-model="tags" />

        <!-- Description -->
        <div class="flex flex-col gap-1">
          <span
            class="text-label-lg font-semibold text-muted-foreground"
            >Description</span
          >
          <RichTextEditor
            v-model="description"
            placeholder="Narrative description, background lore, context…"
            min-height="10rem"
          />
        </div>

        <!-- Notes -->
        <div class="flex flex-col gap-1">
          <span
            class="text-label-lg font-semibold text-muted-foreground"
            >DM Notes</span
          >
          <RichTextEditor
            v-model="notes"
            placeholder="Session notes, loose threads, reminders…"
            min-height="10rem"
          />
        </div>
      </div>

      <!-- Right: objectives, rewards, sub-quests -->
      <div class="flex flex-col gap-4">
        <!-- Objectives -->
        <QuestObjectivesList
          :objectives="objectives"
          :is-new="isNew"
          @toggle="toggleObjective"
          @toggle-visibility="toggleObjectiveVisibility"
          @remove="removeObjective"
          @add="addObjective"
        />

        <!-- Reward: items + currency pools + art objects (unified loot panel) -->
        <EncounterLoot
          :item-ids="rewardItemIds"
          :all-items="allItems ?? []"
          :currency-pools="rewardCurrencyPools"
          @update:item-ids="rewardItemIds = $event"
          @update:currency-pools="rewardCurrencyPools = $event"
          @drop-pool="
            sendCurrencyDrop(
              $event.pp,
              $event.gp,
              $event.ep,
              $event.sp,
              $event.cp,
              $event.label || undefined,
            )
          "
          @drop-item="handleDropLootItem($event.item, $event.qty)"
        />

        <!-- References: encounters, NPCs, locations, monsters -->
        <QuestReferencesPanel
          :is-new="isNew"
          :linked-encounters="linkedEncounters"
          :linked-npc-refs="linkedNpcRefs"
          :linked-location-refs="linkedLocationRefs"
          :linked-monster-refs="linkedMonsterRefs"
          :available-encounters="availableEncounters"
          :available-npcs="availableNpcs"
          :available-locations="availableLocations"
          :available-monsters="availableMonsters"
          :all-encounters="(allEncounters ?? []).map((e) => ({ id: e.id, name: e.name }))"
          :all-npcs="(npcs ?? []).map((n) => ({ id: n.id, name: n.name }))"
          :all-locations="(locations ?? []).map((l) => ({ id: l.id, name: l.name }))"
          :all-monsters="(allMonsters ?? []).map((m) => ({ id: m.id, name: m.name }))"
          @toggle-visibility="toggleRefVisibility"
          @remove="removeRef"
          @add="onAddRef"
        />

        <!-- Triggers -->
        <QuestTriggersPanel
          :is-new="isNew"
          :quest-id="questId"
          :triggers="triggers"
          :objectives="objectives"
          @remove="removeTrigger"
        />

        <!-- Sub-quests + Party Notes -->
        <QuestSidebarPanels
          :is-new="isNew"
          :quest-id="questId"
          :sub-quests="subQuests"
          :shared-notes="sharedNotes"
        />

        <!-- Calendar Pins -->
        <EntityCalendarSection
          entity-type="quest"
          :entity-id="props.quest?.id ?? null"
          :entity-name="title || 'Untitled Quest'"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconPopulate } from '@/lib/icons';
import QuestObjectivesList from "@/components/quests/QuestObjectivesList.vue";
import QuestReferencesPanel from "@/components/quests/QuestReferencesPanel.vue";
import QuestMetadataGrid from "@/components/quests/QuestMetadataGrid.vue";
import QuestTriggersPanel from "@/components/quests/QuestTriggersPanel.vue";
import QuestSidebarPanels from "@/components/quests/QuestSidebarPanels.vue";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import {
  useCreateQuest,
  useUpdateQuest,
  useDeleteQuest,
  useSubQuests,
  useQuestObjectives,
  useCreateObjective,
  useUpdateObjective,
  useDeleteObjective,
  useQuestRefs,
  useCreateQuestRef,
  useUpdateQuestRef,
  useDeleteQuestRef,
  useAllQuests,
  useQuestTriggers,
  useDeleteQuestTrigger,
  scheduleQuestTriggers,
} from "@/composables/useQuests";
import { useEntityNotes } from "@/composables/useEntityNotes";
import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useNpcs } from "@/composables/useNpcs";
import { useAllLocations } from "@/composables/useLocations";
import { useAllMonsters } from "@/composables/useMonsters";
import { useItems } from "@/composables/useItems";
import { useEncounters } from "@/composables/useEncounters";
import { useCreateScriptoriumDocument } from "@/composables/useScriptorium";
import { formatQuestForScriptorium } from "@/lib/scriptorium/scriptoriumImport";
import EntityEditorActionBar from "@/components/common/EntityEditorActionBar.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import EncounterLoot from "@/components/encounters/EncounterLoot.vue";
import TagInput from "@/components/common/TagInput.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";
import {
  QUEST_STATUSES,
  QUEST_STATUS_LABELS,
  QUEST_STATUS_COLORS,
} from "@/types/quest.types";
import type {
  Quest,
  QuestStatus,
  QuestObjective,
  QuestRef,
} from "@/types/quest.types";
import { markEdited, type AiProvenance } from "@/ai/provenance";
import { deepEqual } from "@/lib/utils";

const props = defineProps<{
  quest: Quest | null;
  parentId?: string | null;
}>();

const router = useRouter();
const route  = useRoute();

// Cancel strips `?edit=true` to flip back to the sheet; other query params
// (e.g. `?parent=xxx` for nested creates) are preserved.
function onCancel() {
  const { edit: _edit, ...rest } = route.query;
  router.push({ query: rest });
}
const isNew = computed(() => !props.quest);

// ── External data ──────────────────────────────────────────────────────────────
const { data: npcs } = useNpcs();
const { data: locations } = useAllLocations();
// Two lists of the same bestiary, and the difference matters: `allMonsters`
// names creatures this quest already links — including one since scoped to
// another campaign, which would otherwise show as a bare uuid — while
// `pickableMonsters` offers only what belongs in this campaign to link next.
const { data: allMonsters } = useAllMonsters(() => ({ includeAllScopes: true }));
const { data: pickableMonsters } = useAllMonsters();
const { data: allQuests } = useAllQuests();
const { data: allItems } = useItems();
const { data: allEncounters } = useEncounters();

const parentCandidateOptions = computed(() =>
  (allQuests.value ?? [])
    .filter((q) => q.id !== props.quest?.id)
    .map((q) => ({ id: q.id, name: q.title || "Untitled Quest" })),
);

const questId = computed(() => props.quest?.id ?? "");

const { data: subQuests } = useSubQuests(questId);
const { data: objectives } = useQuestObjectives(questId);
const { data: questRefs } = useQuestRefs(questId);
const { data: triggers } = useQuestTriggers(questId);
const { data: allEntityNotes } = useEntityNotes("quest", questId);
const sharedNotes = computed(() =>
  (allEntityNotes.value ?? []).filter((n) => !n.is_private),
);

// ── Refs derived lists ─────────────────────────────────────────────────────────
const linkedEncounters = computed(() =>
  (questRefs.value ?? []).filter((r) => r.ref_type === "encounter"),
);
const linkedNpcRefs = computed(() =>
  (questRefs.value ?? []).filter((r) => r.ref_type === "npc"),
);
const linkedLocationRefs = computed(() =>
  (questRefs.value ?? []).filter((r) => r.ref_type === "location"),
);
const linkedMonsterRefs = computed(() =>
  (questRefs.value ?? []).filter((r) => r.ref_type === "monster"),
);

const linkedEncounterIds = computed(
  () => new Set(linkedEncounters.value.map((r) => r.ref_id)),
);
const linkedNpcIds = computed(
  () => new Set(linkedNpcRefs.value.map((r) => r.ref_id)),
);
const linkedLocationIds = computed(
  () => new Set(linkedLocationRefs.value.map((r) => r.ref_id)),
);
const linkedMonsterIds = computed(
  () => new Set(linkedMonsterRefs.value.map((r) => r.ref_id)),
);

const availableEncounters = computed(() =>
  (allEncounters.value ?? []).filter(
    (e) => !linkedEncounterIds.value.has(e.id),
  ),
);
const availableNpcs = computed(() =>
  (npcs.value ?? []).filter((n) => !linkedNpcIds.value.has(n.id)),
);
const availableLocations = computed(() =>
  (locations.value ?? []).filter((l) => !linkedLocationIds.value.has(l.id)),
);
const availableMonsters = computed(() =>
  (pickableMonsters.value ?? []).filter((m) => !linkedMonsterIds.value.has(m.id)),
);

// ── Form state ─────────────────────────────────────────────────────────────────
const title = ref(props.quest?.title ?? "");
const summary = ref(props.quest?.summary ?? "");
const status = ref<QuestStatus>(props.quest?.status ?? "undiscovered");
const giverNpcId = ref(props.quest?.giver_npc_id ?? "");
const locationId = ref(props.quest?.location_id ?? "");
const parentQuestId = ref(props.quest?.parent_quest_id ?? props.parentId ?? "");
const rewards = ref(props.quest?.rewards ?? "");
const tags = ref<string[]>(props.quest?.tags ? [...props.quest.tags] : []);
const playerVisibleTo = ref<string[]>(props.quest?.player_visible_to ?? []);
const saving = ref(false);
const deleting = ref(false);
const saveError = ref("");

const rewardItemIds = ref<string[]>([...(props.quest?.reward_item_ids ?? [])]);
const rewardPp = ref(props.quest?.reward_pp ?? 0);
const rewardGp = ref(props.quest?.reward_gp ?? 0);
const rewardEp = ref(props.quest?.reward_ep ?? 0);
const rewardSp = ref(props.quest?.reward_sp ?? 0);
const rewardCp = ref(props.quest?.reward_cp ?? 0);
const rewardCurrencyPools = ref<
  import("@/types/quest.types").RewardCurrencyPool[]
>(props.quest?.reward_currency_pools ?? []);
const sendingToScriptorium = ref(false);

// ── Rich text fields ────────────────────────────────────────────────────────────
const description = ref<string>(props.quest?.description ?? "");
const notes = ref<string>(props.quest?.notes ?? "");
const aiProvenance = ref<AiProvenance | null>(props.quest?.ai_provenance ?? null);

// ── CRUD ───────────────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateQuest();
const { mutateAsync: update } = useUpdateQuest();
const { mutateAsync: del } = useDeleteQuest();
const campaign = useCampaignStore();
const ui = useUiStore();

// ── Triggers ───────────────────────────────────────────────────────────────────

const { mutateAsync: deleteTrigger } = useDeleteQuestTrigger();

async function removeTrigger(trig: { id: string }) {
  if (!props.quest) return;
  await deleteTrigger({ id: trig.id, questId: props.quest.id });
}

function buildPayload() {
  return {
    title: title.value.trim() || "Untitled Quest",
    summary: summary.value.trim() || null,
    status: status.value,
    giver_npc_id: giverNpcId.value || null,
    location_id: locationId.value || null,
    parent_quest_id: parentQuestId.value || null,
    rewards: rewards.value.trim() || null,
    reward_pp: rewardPp.value,
    reward_gp: rewardGp.value,
    reward_ep: rewardEp.value,
    reward_sp: rewardSp.value,
    reward_cp: rewardCp.value,
    reward_item_ids: rewardItemIds.value,
    reward_currency_pools: rewardCurrencyPools.value,
    tags: tags.value,
    description: description.value || null,
    notes: notes.value || null,
    player_visible_to: playerVisibleTo.value,
    started_at: props.quest?.started_at ?? null,
    resolved_at: props.quest?.resolved_at ?? null,
    ai_provenance: aiProvenance.value,
  };
}

async function autoSave() {
  if (!props.quest) return;
  await update({ id: props.quest.id, update: buildPayload() });
}

async function handleDropLootItem(
  item: import("@/types/item.types").Item,
  qty: number,
) {
  await sendItemDrop(item.name, item.id, qty, item.rarity ?? null);
  rewardItemIds.value = rewardItemIds.value.filter((id) => id !== item.id);
  await autoSave();
}

async function save() {
  if (!title.value.trim()) return;
  saving.value = true;
  saveError.value = "";
  const justShared =
    playerVisibleTo.value.length > 0 && !(props.quest?.player_visible_to?.length ?? 0);
  try {
    if (props.quest) {
      // Material edit detection (#606): status (workflow state), rewards,
      // notes (never AI-authored), tags and the giver/location/parent links
      // are excluded per the "moves/tags" carve-outs.
      const contentChanged =
        title.value.trim() !== (props.quest.title || "Untitled Quest") ||
        !deepEqual(summary.value.trim() || null, props.quest.summary) ||
        !deepEqual(description.value || null, props.quest.description);
      if (contentChanged) aiProvenance.value = markEdited(aiProvenance.value);

      const wasCompleted = props.quest.status === "completed";
      await update({ id: props.quest.id, update: buildPayload() });
      if (!wasCompleted && status.value === "completed" && campaign.activeCampaignId) {
        void scheduleQuestTriggers(
          props.quest.id, "quest_complete", null,
          { year: campaign.todayYear, month: campaign.todayMonth, day: campaign.todayDay },
          campaign.activeCampaignId,
        );
      }
      if (justShared && campaign.activeCampaignId)
        void sendCampaignAnnouncement(
          campaign.activeCampaignId,
          `📋 Quest shared: "${title.value.trim()}"`,
          { entity_type: "quest", entity_id: props.quest.id },
        );
      // Return to view mode (strip ?edit=true), not the list
      const { edit: _edit, ...rest } = route.query;
      router.push({ query: rest });
    } else {
      const created = await create(buildPayload());
      if (playerVisibleTo.value.length > 0 && campaign.activeCampaignId)
        void sendCampaignAnnouncement(
          campaign.activeCampaignId,
          `📋 Quest shared: "${created.title}"`,
          { entity_type: "quest", entity_id: created.id },
        );
      ui.dmMode = "prep";
      router.push(`/quests/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.quest) return;
  if (deleting.value) return;
  if (!(await confirm(`Delete "${props.quest.title || "this quest"}"?`)))
    return;
  deleting.value = true;
  try {
    await del(props.quest.id);
    router.push("/quests");
  } catch {
    // failure is surfaced to the user by the mutation's onError toast
  } finally {
    deleting.value = false;
  }
}

// ── Scriptorium ────────────────────────────────────────────────────────────────
const { mutateAsync: createScriptoriumDoc } = useCreateScriptoriumDocument();

async function sendToScriptorium() {
  if (!props.quest) return;
  sendingToScriptorium.value = true;
  try {
    const giverName =
      (npcs.value ?? []).find((n) => n.id === props.quest!.giver_npc_id)
        ?.name ?? null;
    const locName =
      (locations.value ?? []).find((l) => l.id === props.quest!.location_id)
        ?.name ?? null;
    const importData = formatQuestForScriptorium(
      props.quest,
      objectives.value ?? [],
      giverName,
      locName,
    );
    const doc = await createScriptoriumDoc(importData);
    router.push(`/scriptorium/${doc.id}`);
  } finally {
    sendingToScriptorium.value = false;
  }
}

// ── Objectives ─────────────────────────────────────────────────────────────────
const { mutateAsync: createObj } = useCreateObjective();
const { mutateAsync: updateObj } = useUpdateObjective();
const { mutateAsync: deleteObj } = useDeleteObjective();

async function addObjective(description: string) {
  if (!description || !props.quest) return;
  await createObj({
    quest_id: props.quest.id,
    description,
    is_done: false,
    sort_order: objectives.value?.length ?? 0,
    is_player_visible: false,
  });
}

async function toggleObjective(obj: QuestObjective) {
  if (!props.quest) return;
  await updateObj({
    id: obj.id,
    questId: props.quest.id,
    update: { is_done: !obj.is_done },
  });
}

async function toggleObjectiveVisibility(obj: QuestObjective) {
  if (!props.quest) return;
  await updateObj({
    id: obj.id,
    questId: props.quest.id,
    update: { is_player_visible: !obj.is_player_visible },
  });
}

async function removeObjective(obj: QuestObjective) {
  if (!props.quest) return;
  await deleteObj({ id: obj.id, questId: props.quest.id });
}

// ── Quest refs ─────────────────────────────────────────────────────────────────
const { mutateAsync: createRef } = useCreateQuestRef();
const { mutateAsync: updateQuestRef } = useUpdateQuestRef();
const { mutateAsync: deleteRef } = useDeleteQuestRef();
const { sendCurrencyDrop, sendItemDrop } = useCampaignMessages();

async function toggleRefVisibility(ref: QuestRef) {
  if (!props.quest) return;
  await updateQuestRef({
    id: ref.id,
    questId: props.quest.id,
    update: { is_player_visible: !ref.is_player_visible },
  });
}

async function dropCurrencyToChat() {
  await sendCurrencyDrop(
    rewardPp.value,
    rewardGp.value,
    rewardEp.value,
    rewardSp.value,
    rewardCp.value,
  );
}

async function onAddRef(type: "encounter" | "npc" | "location" | "monster", refId: string) {
  if (!props.quest) return;
  await createRef({ quest_id: props.quest.id, ref_type: type, ref_id: refId });
}

async function removeRef(ref: QuestRef) {
  if (!props.quest) return;
  await deleteRef({ id: ref.id, questId: props.quest.id });
}
</script>
