<template>
  <form class="space-y-3 rounded-lg border border-border bg-muted/30 p-3" @submit.prevent="save">
    <div class="flex flex-wrap items-center gap-2 text-body">
      <span>The party reaches level</span>
      <AppSelect v-model.number="level" size="sm" aria-label="Level">
        <option v-for="n in freeLevels" :key="n" :value="n">{{ n }}</option>
      </AppSelect>
      <span>when any</span>
      <AppSelect v-model.number="needs" size="sm" aria-label="How many must be done" :disabled="items.length === 0">
        <option v-for="n in needsChoices" :key="n" :value="n">{{ n }}</option>
      </AppSelect>
      <span>of these {{ items.length === 1 ? "is" : "are" }} done:</span>
    </div>

    <ul v-if="items.length" class="space-y-1">
      <li v-for="item in items" :key="item.key" class="flex items-center gap-2 text-body">
        <span class="min-w-0 flex-1 truncate">
          {{ item.label }}
          <span v-if="item.questTitle" class="text-caption text-muted-foreground"> · {{ item.questTitle }}</span>
        </span>
        <AppButton
          variant="ghost"
          tone="danger"
          size="inline-xs"
          :icon="IconClose"
          :aria-label="`Remove ${item.label}`"
          @click="remove(item.key)"
        />
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">
      Add the quests, or single objectives of a quest, that this level waits on. They can be done in any order.
    </p>

    <EntityCombobox
      v-model="picked"
      :options="pickable"
      placeholder="Add a quest or an objective…"
      dropdown-height="lg"
    />

    <AppInput v-model="note" size="sm" tone="filled" placeholder="A note for yourself (optional)" block :maxlength="280" />

    <p v-if="errorText" class="text-caption text-destructive">{{ errorText }}</p>

    <div class="flex justify-end gap-2">
      <AppButton variant="ghost" size="sm" label="Cancel" @click="emit('done')" />
      <AppButton
        type="submit"
        variant="primary"
        size="sm"
        :label="milestone ? 'Save' : 'Add milestone'"
        :loading="saveMut.isPending.value"
        :disabled="items.length === 0"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconClose } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useQuests } from "@/composables/quests/useQuests";
import {
  useCampaignObjectives,
  useSaveLevelMilestone,
  type LevelMilestone,
} from "@/composables/party/useLevelMilestones";

const { milestone = null, takenLevels } = defineProps<{
  /** The milestone being edited; null to make a new one. */
  milestone?: LevelMilestone | null;
  /** Levels other milestones of the campaign already bring (one milestone per level). */
  takenLevels: number[];
}>();
const emit = defineEmits<{ done: [] }>();

const campaign = useCampaignStore();
const { data: quests } = useQuests();
const { data: objectives } = useCampaignObjectives(() => true);
const saveMut = useSaveLevelMilestone();

interface DraftItem {
  /** `q:<id>` or `o:<id>`, so a quest and an objective never share a key. */
  key: string;
  label: string;
  questTitle: string | null;
}

const freeLevels = computed(() => {
  const taken = new Set(takenLevels);
  return Array.from({ length: 19 }, (_, i) => i + 2).filter((n) => !taken.has(n) || n === milestone?.level);
});

const level = ref<number>(milestone?.level ?? freeLevels.value[0] ?? 2);
const items = ref<DraftItem[]>(
  (milestone?.items ?? []).map((i) => ({
    key: i.questId !== null ? `q:${i.questId}` : `o:${i.objectiveId ?? ""}`,
    label: i.label,
    questTitle: i.questTitle,
  })),
);
const needs = ref<number>(milestone?.needs ?? 1);
const note = ref(milestone?.note ?? "");
const picked = ref("");
const errorText = ref<string | null>(null);

const needsChoices = computed(() => Array.from({ length: Math.max(items.value.length, 1) }, (_, i) => i + 1));

// "Any K of these": K can never be more than the list, so removing an item pulls it down with it.
// Also when the editor opens: a quest deleted since the milestone was saved leaves it needing more than it lists.
watch(
  () => items.value.length,
  (count) => {
    if (count > 0 && needs.value > count) needs.value = count;
  },
  { immediate: true },
);

const pickable = computed(() => {
  const chosen = new Set(items.value.map((i) => i.key));
  const questOptions = (quests.value ?? []).map((q) => ({ id: `q:${q.id}`, name: q.title }));
  const objectiveOptions = (objectives.value ?? []).map((o) => ({
    id: `o:${o.id}`,
    name: `${o.description} (${o.questTitle})`,
  }));
  return [...questOptions, ...objectiveOptions].filter((o) => !chosen.has(o.id));
});

watch(picked, (key) => {
  if (!key) return;
  const quest = key.startsWith("q:") ? (quests.value ?? []).find((q) => `q:${q.id}` === key) : undefined;
  const objective = key.startsWith("o:") ? (objectives.value ?? []).find((o) => `o:${o.id}` === key) : undefined;
  if (quest) items.value.push({ key, label: quest.title, questTitle: null });
  else if (objective) items.value.push({ key, label: objective.description, questTitle: objective.questTitle });
  picked.value = "";
});

function remove(key: string) {
  items.value = items.value.filter((i) => i.key !== key);
}

async function save() {
  const campaignId = campaign.activeCampaignId;
  if (!campaignId || items.value.length === 0) return;
  errorText.value = null;
  try {
    await saveMut.mutateAsync({
      campaignId,
      id: milestone?.id ?? null,
      level: level.value,
      needs: needs.value,
      note: note.value,
      questIds: items.value.filter((i) => i.key.startsWith("q:")).map((i) => i.key.slice(2)),
      objectiveIds: items.value.filter((i) => i.key.startsWith("o:")).map((i) => i.key.slice(2)),
    });
    emit("done");
  } catch (e) {
    // A PostgREST error is a plain object with a message, not an Error.
    errorText.value =
      typeof e === "object" && e !== null && "message" in e ? String(e.message) : "The milestone could not be saved.";
  }
}
</script>
