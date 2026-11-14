<template>
  <section class="flex min-w-0 flex-col gap-2" aria-label="When the party gets here">
    <header class="flex items-center gap-2">
      <h3 class="text-heading-sm font-bold text-foreground">When the party gets here</h3>
      <TagChip v-if="rows.length" class="ml-auto uppercase">{{ rows.length }} payoff{{ rows.length === 1 ? "" : "s" }}</TagChip>
    </header>
    <p class="text-caption text-muted-foreground">
      Rules fire on their own when the party arrives or takes a route. Loot waits until you hand it over.
    </p>

    <template v-for="group in groups" :key="group.key">
      <p v-if="group.title" class="text-label-lg font-bold text-foreground">{{ group.title }}</p>
      <ul class="space-y-1.5" :aria-label="group.label">
        <li v-for="row in group.rows" :key="row.id" class="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2 text-caption">
          <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md" :class="TONE_ICON_BOX[row.tone]">
            <component :is="ICON_COMPONENTS[row.icon]" class="h-3.5 w-3.5" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate text-label-lg font-bold text-foreground">{{ row.summary }}</p>
            <p class="truncate text-muted-foreground">{{ row.caption }}</p>
          </div>
          <span
            class="rounded px-1.5 py-0.5 text-label uppercase"
            :class="row.chip === 'you dispatch' ? 'bg-tone-caution/15 text-ink-caution' : 'bg-muted text-muted-foreground'"
          >{{ row.chip }}</span>
          <AppButton label="Remove" size="xs" variant="subtle" :loading="removingId === row.id" @click="remove(row)" />
        </li>
      </ul>
    </template>
    <p v-if="!rows.length" class="text-caption italic text-muted-foreground">Nothing this beat gives yet.</p>

    <div class="flex flex-wrap gap-1.5">
      <AppButton label="An objective it raises, completes or fails" :icon="IconAdd" size="xs" class="max-sm:min-h-11" :active="activeQuickAdd === 'objective'" @click="toggleQuickAdd('objective')" />
      <AppButton label="New objective this beat raises" :icon="IconAdd" size="xs" class="max-sm:min-h-11" :active="activeQuickAdd === 'newObjective'" @click="toggleQuickAdd('newObjective')" />
      <AppButton label="Other payoff" :icon="IconAdd" size="xs" class="max-sm:min-h-11" :active="othersOpen" :aria-expanded="othersOpen" @click="toggleOthers" />
    </div>

    <div v-if="othersOpen" class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      <AppButton
        v-for="option in QUICK_ADD_OPTIONS"
        :key="option.kind"
        :label="option.label"
        :icon="option.icon"
        size="xs"
        class="max-sm:min-h-11"
        :active="activeQuickAdd === option.kind"
        @click="toggleQuickAdd(option.kind)"
      />
    </div>

    <Transition v-bind="drawerTransition()">
      <div v-if="activeQuickAdd" class="space-y-2 rounded-md border border-dashed border-border p-2">
        <template v-if="activeQuickAdd === 'newObjective'">
          <AppInput v-model="newObjectiveText" size="body-xs" placeholder="What the party now has to do…" aria-label="New objective" />
          <p class="text-caption text-muted-foreground">Players see it once the party gets here.</p>
        </template>

        <template v-else-if="activeQuickAdd === 'objective'">
          <AppSelect v-model="ledgerAction" block aria-label="What happens to the objective">
            <option value="raise">Raise</option>
            <option value="complete">Complete</option>
            <option value="fail">Fail</option>
          </AppSelect>
          <AppSelect v-if="objectiveOptions.length" v-model="targetObjectiveId" block aria-label="Which objective">
            <option value="">Which objective…</option>
            <option v-for="objective in objectiveOptions" :key="objective.id" :value="objective.id">{{ objective.name }}</option>
          </AppSelect>
          <p v-else class="text-caption italic text-muted-foreground">No objectives yet. Add one this beat raises.</p>
          <AppSelect v-model="conditionEdgeId" block aria-label="When this fires">
            <option value="">On arriving here</option>
            <option value="failed">If it goes wrong</option>
          </AppSelect>
        </template>

        <template v-else-if="activeQuickAdd === 'item' || activeQuickAdd === 'riches'">
          <EntityCombobox
            v-if="activeQuickAdd === 'item'"
            v-model="itemId"
            class="min-w-0"
            :options="itemOptions"
            placeholder="Find an Item Vault item…"
          />
          <div v-if="activeQuickAdd === 'item'" class="grid grid-cols-2 gap-2">
            <label class="text-caption text-muted-foreground">Quantity <AppInput v-model.number="quantity" type="number" min="1" /></label>
            <label class="text-caption text-muted-foreground">Table label <AppInput v-model="label" placeholder="Optional label" /></label>
          </div>
          <CoinInput v-else v-model="coins" />
        </template>

        <template v-else>
          <AppSelect v-model="conditionEdgeId" block aria-label="When this fires">
            <option value="">On arriving here</option>
            <option value="failed">If it goes wrong</option>
            <option v-for="edge in outgoingEdges" :key="edge.id" :value="edge.id">On taking the route to {{ beatTitle(edge.target_beat_id) }}</option>
          </AppSelect>
          <label class="flex items-center gap-1 text-caption text-muted-foreground">
            <AppInput v-model.number="afterDays" type="number" min="0" size="body-xs" :block="false" class="w-16" />
            days later
          </label>

          <template v-if="activeQuickAdd === 'influence'">
            <EntityCombobox v-if="npcOptions.length" v-model="targetNpcId" :options="npcOptions" placeholder="Which NPC…" />
            <p v-else class="text-caption italic text-muted-foreground">No NPCs in this campaign yet.</p>
            <AppSelect v-if="npcOptions.length" v-model="relationshipShiftKey" aria-label="What happens to their stance">
              <option v-for="option in RELATIONSHIP_SHIFT_OPTIONS" :key="option.key" :value="option.key">{{ option.label }}</option>
            </AppSelect>
          </template>
          <template v-else-if="activeQuickAdd === 'knowledge'">
            <AppInput v-model="knowledgeText" size="body-xs" placeholder="What do the players learn…" />
          </template>
          <template v-else-if="activeQuickAdd === 'quest'">
            <EntityCombobox v-if="unlockableQuestOptions.length" v-model="targetQuestId" :options="unlockableQuestOptions" placeholder="Which quest…" />
            <p v-else class="text-caption italic text-muted-foreground">No undiscovered quests to unlock. Write the sequel first and leave it undiscovered.</p>
            <template v-if="targetQuestId">
              <EntityCombobox v-if="entryBeatOptions.length" v-model="entryBeatId" :options="entryBeatOptions" placeholder="Enters at…" />
              <p v-else class="text-caption italic text-muted-foreground">This quest has no beats yet. It will open at whichever beat is written first.</p>
            </template>
          </template>
          <template v-else-if="activeQuickAdd === 'handout'">
            <EntityCombobox v-if="handoutOptions.length" v-model="targetDocumentId" :options="handoutOptions" placeholder="Which handout…" />
            <p v-else class="text-caption italic text-muted-foreground">No handouts in this campaign yet. Write one in the Scriptorium first.</p>
            <p v-if="handoutOptions.length" class="text-caption text-muted-foreground">The whole party receives it.</p>
          </template>
          <template v-else-if="activeQuickAdd === 'favor'">
            <EntityCombobox v-if="npcOptions.length" v-model="targetNpcId" :options="npcOptions" placeholder="Which NPC…" />
            <p v-else class="text-caption italic text-muted-foreground">No NPCs in this campaign yet.</p>
            <AppInput v-if="npcOptions.length" v-model="favorText" size="body-xs" placeholder="What do they owe the party…" />
          </template>
          <template v-else-if="activeQuickAdd === 'milestone'">
            <AppInput v-model="milestoneText" size="body-xs" placeholder="What did the party earn…" />
          </template>
          <template v-else-if="activeQuickAdd === 'event'">
            <AppInput v-model="calendarTitle" size="body-xs" placeholder="Event title…" />
            <AppSelect v-model="calendarType" aria-label="Event type">
              <option v-for="t in CALENDAR_EVENT_TYPES" :key="t" :value="t">{{ t }}</option>
            </AppSelect>
            <AppInput v-model="calendarDescription" size="body-xs" placeholder="Description (optional)…" />
          </template>
          <QuestWorldVerbFields
            v-else-if="worldVerb"
            v-model:clock-id="targetClockId"
            v-model:clock-step="clockStep"
            v-model:npc-id="targetNpcId"
            v-model:location-id="targetLocationId"
            v-model:faction-id="targetFactionId"
            v-model:shift-key="relationshipShiftKey"
            :verb="worldVerb"
            :targets="targets"
          />
        </template>

        <div class="flex justify-end gap-2">
          <AppButton label="Cancel" size="xs" variant="subtle" @click="closeQuickAdd" />
          <AppButton label="Add" size="xs" :disabled="!canAdd" :loading="adding" @click="submit" />
        </div>
      </div>
    </Transition>
    <!-- Outside the add form: a refused remove reports here too, with the form closed. -->
    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import TagChip from "@/components/common/TagChip.vue";
import { computed, ref, watch, type Component } from "vue";
import { useCreateLootPlacement, useCreateQuestConsequence, useDeleteLootPlacement, useDeleteQuestConsequence } from "@/composables/quests/useQuestFlow";
import { useCreateObjective, useQuestObjectives, useQuests } from "@/composables/quests/useQuests";
import { useUnlockEntryPicker } from "@/composables/quests/useUnlockEntryPicker";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { itemRefColumns } from "@/lib/itemRef";
import { useHandoutPayoff } from "@/composables/quests/useHandoutPayoff";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useWorldVerbTargets } from "@/composables/quests/useWorldVerbTargets";
import { drawerTransition } from "@/lib/motion";
import { derivePayoffRows, type PayoffIcon, type PayoffRow, type PayoffTone } from "@/lib/quests/payoff";
import { type QuestBeat, type QuestConsequenceAction, type QuestBeatEdge, type QuestConsequence, type QuestConsequenceActionPayload, type QuestConsequenceInsert, type LootPlacement } from "@/types/quest.types";
import { DEFAULT_RELATIONSHIP_SHIFT_KEY, RELATIONSHIP_SHIFT_OPTIONS, isTargetedWorldVerb, relationshipShiftPayload, worldVerbInsertFields, worldVerbReady, type WorldVerbDraft } from "@/lib/quests/consequences";
import { EVENT_TYPE_COLORS, type CalendarEventType } from "@/types/calendar.types";
import {
  IconAdd, IconAward, IconCalendar, IconCheck, IconClock, IconCoins, IconDocument, IconFaction, IconHand, IconInvite, IconPackage, IconParty, IconPin, IconQuest, IconScrollText, IconSend,
} from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import CoinInput from "@/components/currency/CoinInput.vue";
import { useCurrency } from "@/composables/currency/useCurrency";
import { hasCoins, type Coins } from "@/lib/currency/currency";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import QuestWorldVerbFields from "./QuestWorldVerbFields.vue";

const { beat, edges, beats, consequences, loot } = defineProps<{
  beat: QuestBeat;
  /** Every edge in the quest — outgoing routes are filtered from this. */
  edges: QuestBeatEdge[];
  beats: QuestBeat[];
  /** Every consequence in the quest — narrowed to this beat's own by `derivePayoffRows`. */
  consequences: QuestConsequence[];
  /** This beat's own loot, already filtered by the caller. */
  loot: LootPlacement[];
}>();

const ICON_COMPONENTS: Record<PayoffIcon, Component> = {
  invite: IconInvite, hand: IconHand, scrollText: IconScrollText, quest: IconQuest, coins: IconCoins,
  package: IconPackage, check: IconCheck, calendar: IconCalendar, send: IconSend, award: IconAward, document: IconDocument,
  clock: IconClock, pin: IconPin, party: IconParty, faction: IconFaction,
};
const TONE_ICON_BOX: Record<PayoffTone, string> = {
  destructive: "bg-destructive/15 text-destructive",
  caution: "bg-tone-caution/15 text-ink-caution",
  info: "bg-tone-info/15 text-ink-info",
  arcane: "bg-tone-arcane/15 text-ink-arcane",
  primary: "bg-primary/15 text-primary",
  muted: "bg-muted text-muted-foreground",
};

const outgoingEdges = computed(() => edges.filter((edge) => edge.source_beat_id === beat.id));
const { data: objectives } = useQuestObjectives(computed(() => beat.quest_id));
function objectiveLabel(id: string | null): string {
  if (!id) return "";
  return objectives.value?.find((objective) => objective.id === id)?.description ?? "Objective removed";
}
const { handoutOptions, documentLabel } = useHandoutPayoff(() => beat.campaign_id);
const rows = computed<PayoffRow[]>(() => derivePayoffRows({
  beatId: beat.id,
  consequences,
  outgoingEdges: outgoingEdges.value,
  beats,
  loot,
  formatCoins,
  objectiveLabel,
  questLabel: unlockQuestLabel,
  beatLabel: unlockBeatLabel,
  documentLabel,
  clockLabel: (id) => targets.clockLabel(id),
  npcLabel: (id) => targets.npcLabel(id),
  locationLabel: (id) => targets.locationLabel(id),
  factionLabel: (id) => targets.factionLabel(id),
}));

// "If it goes wrong" is a rule's own outcome (`on_beat_outcome`), not a route, so it
// is the one thing that sets a row apart: everything else reads "when the party gets here".
const failedRuleIds = computed(() => new Set(consequences
  .filter((row) => row.on_beat_id === beat.id && row.on_beat_outcome === "failed")
  .map((row) => row.id)));
const groups = computed(() => {
  const failed = rows.value.filter((row) => row.source === "consequence" && failedRuleIds.value.has(row.id));
  const arrival = rows.value.filter((row) => !failed.includes(row));
  return [
    { key: "arrival", title: "", label: "On arrival", rows: arrival },
    { key: "failed", title: "If it goes wrong", label: "If it goes wrong", rows: failed },
  ].filter((group) => group.rows.length);
});

function beatTitle(id: string): string {
  return beats.find((row) => row.id === id)?.title || "Missing beat";
}

// ── Remove ───────────────────────────────────────────────────────────────────

const removingId = ref("");
const deleteConsequence = useDeleteQuestConsequence();
const deleteLoot = useDeleteLootPlacement();

async function remove(row: PayoffRow) {
  removingId.value = row.id;
  error.value = "";
  try {
    if (row.source === "consequence") await deleteConsequence.mutateAsync({ id: row.id, questId: beat.quest_id });
    else await deleteLoot.mutateAsync({ id: row.id, campaignId: beat.campaign_id });
  } catch (caught) {
    // Neither delete mutation toasts, so without this a refused delete said nothing.
    error.value = caught instanceof Error ? caught.message : "Could not remove this payoff";
  } finally {
    removingId.value = "";
  }
}

// ── Quick adds ───────────────────────────────────────────────────────────────

type QuickAddKind = "objective" | "newObjective" | "item" | "riches" | "influence" | "knowledge" | "quest" | "favor" | "milestone" | "event" | "handout" | "clock" | "move" | "companion" | "standing";
const QUICK_ADD_OPTIONS: Array<{ kind: QuickAddKind; label: string; icon: Component }> = [
  { kind: "item", label: "Item", icon: IconPackage },
  { kind: "riches", label: "Riches", icon: IconCoins },
  { kind: "influence", label: "Influence", icon: IconInvite },
  { kind: "knowledge", label: "Knowledge", icon: IconScrollText },
  { kind: "quest", label: "Quest", icon: IconQuest },
  { kind: "favor", label: "Favour", icon: IconHand },
  { kind: "milestone", label: "Milestone", icon: IconAward },
  { kind: "event", label: "Event", icon: IconCalendar },
  { kind: "handout", label: "Handout", icon: IconDocument },
  { kind: "clock", label: "Tick clock", icon: IconClock },
  { kind: "move", label: "Move NPC", icon: IconPin },
  { kind: "companion", label: "Companion", icon: IconParty },
  { kind: "standing", label: "Standing", icon: IconFaction },
];

/** The #1011 quick-adds, keyed to the verb each writes. */
const WORLD_VERB_FOR_KIND: Partial<Record<QuickAddKind, QuestConsequenceAction>> = {
  clock: "tick_clock",
  move: "move_npc",
  companion: "add_companion",
  standing: "shift_faction_standing",
};

const activeQuickAdd = ref<QuickAddKind | null>(null);
// The #1011 and reward quick-adds sit behind "Other payoff": objectives lead, since a beat mostly moves those.
const othersOpen = ref(false);
function toggleOthers() {
  othersOpen.value = !othersOpen.value;
  if (!othersOpen.value && activeQuickAdd.value && activeQuickAdd.value !== "objective" && activeQuickAdd.value !== "newObjective") closeQuickAdd();
}
const adding = ref(false);
const error = ref("");

// Loot fields
const { data: items } = useItemIndex();
const createLoot = useCreateLootPlacement();
const itemId = ref("");
const label = ref("");
const quantity = ref(1);
const coins = ref<Coins>({});
const { formatCoins } = useCurrency();
// Library rows are offered as references; the index already holds only this account's own rows.
const itemOptions = computed(() => (items.value ?? []).map((item) => ({ id: item.id, name: item.name })));

// Objective fields
const createObjective = useCreateObjective();
const ledgerAction = ref<"raise" | "complete" | "fail">("raise");
const targetObjectiveId = ref("");
const newObjectiveText = ref("");
const objectiveOptions = computed(() => (objectives.value ?? []).map((objective) => ({ id: objective.id, name: objective.description })));

// Consequence fields
const createConsequence = useCreateQuestConsequence();
const conditionEdgeId = ref("");
const afterDays = ref(0);
const targetNpcId = ref("");
const relationshipShiftKey = ref(DEFAULT_RELATIONSHIP_SHIFT_KEY);
const targetQuestId = ref("");
const targetDocumentId = ref("");
const knowledgeText = ref("");
const favorText = ref("");
const milestoneText = ref("");
const calendarTitle = ref("");
const calendarType = ref<string>("quest");
const calendarDescription = ref("");
const targetClockId = ref("");
const clockStep = ref(1);
const targetLocationId = ref("");
const targetFactionId = ref("");
const CALENDAR_EVENT_TYPES = Object.keys(EVENT_TYPE_COLORS) as CalendarEventType[];

const worldVerb = computed(() => (activeQuickAdd.value ? WORLD_VERB_FOR_KIND[activeQuickAdd.value] ?? null : null));
// Existing rows name their targets from these lists too, so they load as soon as
// a #1011 rule exists on this quest or one is being written.
const targets = useWorldVerbTargets(() => beat.quest_id, () => worldVerb.value !== null || consequences.some((row) => isTargetedWorldVerb(row.action)));

const { data: npcs } = useNpcs();
const npcOptions = computed(() => (npcs.value ?? []).map((npc) => ({ id: npc.id, name: npc.name })));

// Only `undiscovered` quests, and never the quest being edited — the same
// no-self-unlock rule the flow's own consequence editor enforces.
const { data: allQuests } = useQuests();
const unlockableQuestOptions = computed(() => (allQuests.value ?? [])
  .filter((quest) => quest.status === "undiscovered" && quest.id !== beat.quest_id)
  .map((quest) => ({ id: quest.id, name: quest.title })));

// "Enters at" (#871) — see useUnlockEntryPicker for the shared mechanism.
const {
  entryBeatId, entryBeatOptions, unlockQuestLabel, unlockBeatLabel, resolveEntryBeatId,
  reset: resetEntryBeatPicker,
} = useUnlockEntryPicker({
  targetQuestId,
  fallbackTargetQuestId: () => consequences.find((row) => row.action === "unlock_quest" && row.target_quest_id)?.target_quest_id ?? "",
});

function resetQuickAddFields() {
  itemId.value = ""; label.value = ""; quantity.value = 1;
  coins.value = {};
  conditionEdgeId.value = ""; afterDays.value = 0;
  targetNpcId.value = ""; relationshipShiftKey.value = DEFAULT_RELATIONSHIP_SHIFT_KEY; targetQuestId.value = ""; targetDocumentId.value = ""; resetEntryBeatPicker();
  knowledgeText.value = ""; favorText.value = ""; milestoneText.value = "";
  calendarTitle.value = ""; calendarType.value = "quest"; calendarDescription.value = "";
  targetClockId.value = ""; clockStep.value = 1; targetLocationId.value = ""; targetFactionId.value = "";
  ledgerAction.value = "raise"; targetObjectiveId.value = ""; newObjectiveText.value = "";
  error.value = "";
}

function toggleQuickAdd(kind: QuickAddKind) {
  if (activeQuickAdd.value === kind) { closeQuickAdd(); return; }
  resetQuickAddFields();
  activeQuickAdd.value = kind;
}
function closeQuickAdd() {
  activeQuickAdd.value = null;
  resetQuickAddFields();
}

watch(() => beat.id, closeQuickAdd);

const worldDraft = computed<WorldVerbDraft>(() => ({
  clockId: targetClockId.value, clockStep: clockStep.value, npcId: targetNpcId.value,
  locationId: targetLocationId.value, factionId: targetFactionId.value, shiftKey: relationshipShiftKey.value,
}));

const canAdd = computed(() => {
  switch (activeQuickAdd.value) {
    case "newObjective": return !!newObjectiveText.value.trim();
    case "objective": return !!targetObjectiveId.value;
    case "item": return !!itemId.value && quantity.value > 0;
    case "riches": return hasCoins(coins.value);
    case "influence": return !!targetNpcId.value && relationshipShiftPayload(relationshipShiftKey.value) !== null;
    case "knowledge": return !!knowledgeText.value.trim();
    case "quest": return !!targetQuestId.value;
    case "favor": return !!targetNpcId.value && !!favorText.value.trim();
    case "milestone": return !!milestoneText.value.trim();
    case "event": return !!calendarTitle.value.trim();
    case "handout": return !!targetDocumentId.value;
    case "clock":
    case "move":
    case "companion":
    case "standing": return worldVerb.value !== null && worldVerbReady(worldVerb.value, worldDraft.value);
    default: return false;
  }
});

async function submit() {
  if (!canAdd.value || !activeQuickAdd.value) return;
  adding.value = true;
  error.value = "";
  try {
    if (activeQuickAdd.value === "item" || activeQuickAdd.value === "riches") {
      await createLoot.mutateAsync({
        beat_id: beat.id,
        quest_id: beat.quest_id,
        campaign_id: beat.campaign_id,
        kind: activeQuickAdd.value === "item" ? "item" : "currency",
        ...itemRefColumns(activeQuickAdd.value === "item" ? itemId.value : null),
        quantity: activeQuickAdd.value === "item" ? Math.max(1, Math.floor(quantity.value)) : 1,
        label: label.value.trim(),
        payload: activeQuickAdd.value === "riches" ? { coins: coins.value } : {},
        source_type: "prepared",
        source_id: null,
        sort_order: loot.length,
      });
    } else {
      // A new objective is raised on arrival, whatever the form last said about when.
      const when = activeQuickAdd.value === "newObjective" ? "" : conditionEdgeId.value;
      const goesWrong = when === "failed";
      const edgeId = goesWrong ? "" : when;
      let objectiveId: string | null = null;
      if (activeQuickAdd.value === "newObjective") {
        // Dormant, so players see nothing until the raise below fires on arrival.
        const created = await createObjective.mutateAsync({
          quest_id: beat.quest_id,
          description: newObjectiveText.value.trim(),
          status: "dormant",
          sort_order: Math.max(-1, ...(objectives.value ?? []).map((objective) => objective.sort_order)) + 1,
          due_year: null, due_month: null, due_day: null,
        });
        objectiveId = created.id;
      } else if (activeQuickAdd.value === "objective") objectiveId = targetObjectiveId.value;
      const action = { objective: ledgerAction.value, newObjective: "raise", influence: "shift_npc_relationship", knowledge: "grant_knowledge", quest: "unlock_quest", favor: "owe_favor", milestone: "award_milestone", event: "create_calendar_event", handout: "give_handout", clock: "tick_clock", move: "move_npc", companion: "add_companion", standing: "shift_faction_standing" }[activeQuickAdd.value] as QuestConsequenceInsert["action"];
      const world = isTargetedWorldVerb(action) ? worldVerbInsertFields(action, worldDraft.value) : null;
      const payload: QuestConsequenceActionPayload = world
        ? world.action_payload
        : activeQuickAdd.value === "influence"
        ? relationshipShiftPayload(relationshipShiftKey.value)!
        : activeQuickAdd.value === "knowledge"
          ? { text: knowledgeText.value.trim() }
          : activeQuickAdd.value === "favor"
            ? { text: favorText.value.trim() }
            : activeQuickAdd.value === "milestone"
              ? { text: milestoneText.value.trim() }
              : activeQuickAdd.value === "event"
                ? { title: calendarTitle.value.trim(), event_type: calendarType.value, ...(calendarDescription.value.trim() ? { description: calendarDescription.value.trim() } : {}) }
                : {};
      const insert: QuestConsequenceInsert = {
        quest_id: beat.quest_id,
        on_beat_id: edgeId ? null : beat.id,
        on_edge_id: edgeId || null,
        ...(goesWrong ? { on_beat_outcome: "failed" as const } : {}),
        on_objective_id: null,
        on_objective_status: null,
        on_quest_settled: false,
        on_location_id: null,
        on_location_fact: null,
        on_clock_id: null,
        after_days: afterDays.value || 0,
        action,
        target_objective_id: objectiveId,
        target_npc_id: activeQuickAdd.value === "influence" || activeQuickAdd.value === "favor" ? targetNpcId.value : null,
        target_clock_id: null,
        target_location_id: null,
        target_faction_id: null,
        ...world,
        target_quest_id: activeQuickAdd.value === "quest" ? targetQuestId.value : null,
        target_document_id: activeQuickAdd.value === "handout" ? targetDocumentId.value : null,
        entry_beat_id: activeQuickAdd.value === "quest" ? resolveEntryBeatId() : null,
        action_payload: payload,
      };
      await createConsequence.mutateAsync(insert);
    }
    closeQuickAdd();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not add this payoff";
  } finally {
    adding.value = false;
  }
}
</script>
