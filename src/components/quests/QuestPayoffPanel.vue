<template>
  <section class="flex min-h-0 flex-1 flex-col gap-2 rounded-xl border border-border bg-card p-3" aria-label="Payoff">
    <header class="flex items-center gap-2">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Payoff</h3>
      <span v-if="rows.length" class="ml-auto rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ rows.length }} payoff{{ rows.length === 1 ? "" : "s" }}</span>
    </header>
    <p class="text-caption text-muted-foreground">
      Consequences fire on their own when the party arrives or takes a route. Loot waits until you hand it over.
    </p>

    <ul v-if="rows.length" class="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
      <li v-for="row in rows" :key="row.id" class="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border p-2 text-caption">
        <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md" :class="TONE_ICON_BOX[row.tone]">
          <component :is="ICON_COMPONENTS[row.icon]" class="h-3.5 w-3.5" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="truncate font-cinzel text-label-lg font-bold text-foreground">{{ row.summary }}</p>
          <p class="truncate text-muted-foreground">{{ row.caption }}</p>
        </div>
        <span
          class="rounded px-1.5 py-0.5 text-label uppercase"
          :class="row.chip === 'you dispatch' ? 'bg-tone-caution/15 text-ink-caution' : 'bg-muted text-muted-foreground'"
        >{{ row.chip }}</span>
        <AppButton label="Remove" size="xs" variant="subtle" :loading="removingId === row.id" @click="remove(row)" />
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">Nothing this beat gives yet.</p>

    <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      <AppButton
        v-for="option in QUICK_ADD_OPTIONS"
        :key="option.kind"
        :label="option.label"
        :icon="option.icon"
        size="xs"
        :active="activeQuickAdd === option.kind"
        @click="toggleQuickAdd(option.kind)"
      />
    </div>

    <Transition v-bind="drawerTransition()">
      <div v-if="activeQuickAdd" class="space-y-2 rounded-md border border-dashed border-border p-2">
        <template v-if="activeQuickAdd === 'item' || activeQuickAdd === 'riches'">
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
          <div v-else class="grid grid-cols-5 gap-2">
            <label v-for="coin in COINS" :key="coin" class="text-caption uppercase text-muted-foreground">{{ coin }}<AppInput v-model.number="currency[coin]" type="number" min="0" /></label>
          </div>
        </template>

        <template v-else>
          <AppSelect v-model="conditionEdgeId" block aria-label="When this fires">
            <option value="">On arriving here</option>
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
            <p v-else class="text-caption italic text-muted-foreground">No undiscovered quests to unlock — write the sequel first and leave it undiscovered.</p>
            <template v-if="targetQuestId">
              <EntityCombobox v-if="entryBeatOptions.length" v-model="entryBeatId" :options="entryBeatOptions" placeholder="Enters at…" />
              <p v-else class="text-caption italic text-muted-foreground">This quest has no beats yet — it will open at whichever beat is written first.</p>
            </template>
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
          </template>
        </template>

        <div class="flex justify-end gap-2">
          <AppButton label="Cancel" size="xs" variant="subtle" @click="closeQuickAdd" />
          <AppButton label="Add" size="xs" :disabled="!canAdd" :loading="adding" @click="submit" />
        </div>
        <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, type Component } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useCreateLootPlacement, useCreateQuestConsequence, useDeleteLootPlacement, useDeleteQuestConsequence } from "@/composables/quests/useQuestFlow";
import { useQuestObjectives, useQuests } from "@/composables/quests/useQuests";
import { useUnlockEntryPicker } from "@/composables/quests/useUnlockEntryPicker";
import { useItems } from "@/composables/items/useItems";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { drawerTransition } from "@/lib/motion";
import { derivePayoffRows, type PayoffIcon, type PayoffRow, type PayoffTone } from "@/lib/quests/payoff";
import { type QuestBeat, type QuestBeatEdge, type QuestConsequence, type QuestConsequenceActionPayload, type QuestConsequenceInsert, type LootPlacement } from "@/types/quest.types";
import { DEFAULT_RELATIONSHIP_SHIFT_KEY, RELATIONSHIP_SHIFT_OPTIONS, relationshipShiftPayload } from "@/lib/quests/consequences";
import { EVENT_TYPE_COLORS, type CalendarEventType } from "@/types/calendar.types";
import {
  IconAward, IconCalendar, IconCheck, IconCoins, IconHand, IconInvite, IconPackage, IconQuest, IconScrollText, IconSend,
} from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

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
  package: IconPackage, check: IconCheck, calendar: IconCalendar, send: IconSend, award: IconAward,
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
const rows = computed<PayoffRow[]>(() => derivePayoffRows({
  beatId: beat.id,
  consequences,
  outgoingEdges: outgoingEdges.value,
  beats,
  loot,
  objectiveLabel,
  questLabel: unlockQuestLabel,
  beatLabel: unlockBeatLabel,
}));

function beatTitle(id: string): string {
  return beats.find((row) => row.id === id)?.title || "Missing beat";
}

// ── Remove ───────────────────────────────────────────────────────────────────

const removingId = ref("");
const deleteConsequence = useDeleteQuestConsequence();
const deleteLoot = useDeleteLootPlacement();

async function remove(row: PayoffRow) {
  removingId.value = row.id;
  try {
    if (row.source === "consequence") await deleteConsequence.mutateAsync({ id: row.id, questId: beat.quest_id });
    else await deleteLoot.mutateAsync({ id: row.id, campaignId: beat.campaign_id });
  } finally {
    removingId.value = "";
  }
}

// ── Quick adds ───────────────────────────────────────────────────────────────

type QuickAddKind = "item" | "riches" | "influence" | "knowledge" | "quest" | "favor" | "milestone" | "event";
const QUICK_ADD_OPTIONS: Array<{ kind: QuickAddKind; label: string; icon: Component }> = [
  { kind: "item", label: "Item", icon: IconPackage },
  { kind: "riches", label: "Riches", icon: IconCoins },
  { kind: "influence", label: "Influence", icon: IconInvite },
  { kind: "knowledge", label: "Knowledge", icon: IconScrollText },
  { kind: "quest", label: "Quest", icon: IconQuest },
  { kind: "favor", label: "Favour", icon: IconHand },
  { kind: "milestone", label: "Milestone", icon: IconAward },
  { kind: "event", label: "Event", icon: IconCalendar },
];

const activeQuickAdd = ref<QuickAddKind | null>(null);
const adding = ref(false);
const error = ref("");

// Loot fields
const auth = useAuthStore();
const { data: items } = useItems();
const createLoot = useCreateLootPlacement();
const itemId = ref("");
const label = ref("");
const quantity = ref(1);
const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;
const currency = reactive<Record<(typeof COINS)[number], number>>({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
const itemOptions = computed(() => (items.value ?? [])
  .filter((item) => item.user_id === auth.user?.id || item.campaign_id === beat.campaign_id)
  .map((item) => ({ id: item.id, name: item.name })));

// Consequence fields
const createConsequence = useCreateQuestConsequence();
const conditionEdgeId = ref("");
const afterDays = ref(0);
const targetNpcId = ref("");
const relationshipShiftKey = ref(DEFAULT_RELATIONSHIP_SHIFT_KEY);
const targetQuestId = ref("");
const knowledgeText = ref("");
const favorText = ref("");
const milestoneText = ref("");
const calendarTitle = ref("");
const calendarType = ref<string>("quest");
const CALENDAR_EVENT_TYPES = Object.keys(EVENT_TYPE_COLORS) as CalendarEventType[];

const { data: npcs } = useNpcs();
const npcOptions = computed(() => (npcs.value ?? []).map((npc) => ({ id: npc.id, name: npc.name })));

// Only `undiscovered` quests, and never the quest being edited — the same
// no-self-unlock rule the flow's own consequence editor enforces.
const { data: undiscoveredQuests } = useQuests("undiscovered");
const unlockableQuestOptions = computed(() => (undiscoveredQuests.value ?? [])
  .filter((quest) => quest.id !== beat.quest_id)
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
  for (const coin of COINS) currency[coin] = 0;
  conditionEdgeId.value = ""; afterDays.value = 0;
  targetNpcId.value = ""; relationshipShiftKey.value = DEFAULT_RELATIONSHIP_SHIFT_KEY; targetQuestId.value = ""; resetEntryBeatPicker();
  knowledgeText.value = ""; favorText.value = ""; milestoneText.value = "";
  calendarTitle.value = ""; calendarType.value = "quest";
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

const canAdd = computed(() => {
  switch (activeQuickAdd.value) {
    case "item": return !!itemId.value && quantity.value > 0;
    case "riches": return COINS.some((coin) => currency[coin] > 0);
    case "influence": return !!targetNpcId.value && relationshipShiftPayload(relationshipShiftKey.value) !== null;
    case "knowledge": return !!knowledgeText.value.trim();
    case "quest": return !!targetQuestId.value;
    case "favor": return !!targetNpcId.value && !!favorText.value.trim();
    case "milestone": return !!milestoneText.value.trim();
    case "event": return !!calendarTitle.value.trim();
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
        item_id: activeQuickAdd.value === "item" ? itemId.value : null,
        quantity: activeQuickAdd.value === "item" ? Math.max(1, Math.floor(quantity.value)) : 1,
        label: label.value.trim(),
        payload: activeQuickAdd.value === "riches" ? { ...currency } : {},
        source_type: "prepared",
        source_id: null,
        sort_order: loot.length,
      });
    } else {
      const action = { influence: "shift_npc_relationship", knowledge: "grant_knowledge", quest: "unlock_quest", favor: "owe_favor", milestone: "award_milestone", event: "create_calendar_event" }[activeQuickAdd.value] as QuestConsequenceInsert["action"];
      const payload: QuestConsequenceActionPayload = activeQuickAdd.value === "influence"
        ? relationshipShiftPayload(relationshipShiftKey.value)!
        : activeQuickAdd.value === "knowledge"
          ? { text: knowledgeText.value.trim() }
          : activeQuickAdd.value === "favor"
            ? { text: favorText.value.trim() }
            : activeQuickAdd.value === "milestone"
              ? { text: milestoneText.value.trim() }
              : activeQuickAdd.value === "event"
                ? { title: calendarTitle.value.trim(), event_type: calendarType.value }
                : {};
      const insert: QuestConsequenceInsert = {
        quest_id: beat.quest_id,
        on_beat_id: conditionEdgeId.value ? null : beat.id,
        on_edge_id: conditionEdgeId.value || null,
        on_objective_id: null,
        on_objective_status: null,
        on_quest_settled: false,
        on_location_id: null,
        on_location_fact: null,
        after_days: afterDays.value || 0,
        action,
        target_objective_id: null,
        target_npc_id: activeQuickAdd.value === "influence" || activeQuickAdd.value === "favor" ? targetNpcId.value : null,
        target_quest_id: activeQuickAdd.value === "quest" ? targetQuestId.value : null,
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
