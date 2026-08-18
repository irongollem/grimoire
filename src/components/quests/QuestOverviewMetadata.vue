<template>
  <section class="space-y-3 rounded-lg border border-border bg-card p-3" aria-label="Quest-wide fields">
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <h3 class="font-cinzel text-sm font-bold text-foreground">Quest identity</h3>
        <p class="text-caption text-muted-foreground">Whole-story fields. Narrative preparation lives on the overview beat below.</p>
      </div>
      <span class="text-caption" :class="saveError ? 'text-destructive' : 'text-muted-foreground'">
        {{ saveError || (saving ? "Saving…" : "Saved") }}
      </span>
    </div>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label class="flex flex-col gap-1 sm:col-span-2">
        <span class="text-label font-semibold text-muted-foreground">Title</span>
        <AppInput
          v-model="title"
          tone="card"
          size="body"
          placeholder="Untitled Quest"
          @blur="saveMetadata"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">Board lane</span>
        <AppSelect v-model="status" @change="saveMetadata">
          <option v-for="value in QUEST_STATUSES" :key="value" :value="value">{{ QUEST_STATUS_LABELS[value] }}</option>
        </AppSelect>
      </label>

      <div class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">Player sharing</span>
        <div class="flex min-h-9 items-center gap-2">
          <AudienceRevealControl
            :name="quest.title"
            :visible-to="playerVisibleTo"
            @change="onRevealChange"
          />
        </div>
      </div>

      <label class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">Quest giver</span>
        <EntityCombobox v-model="giverNpcId" :options="npcs ?? []" placeholder="Search NPCs…" @update:model-value="saveMetadata" />
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-label font-semibold text-muted-foreground">Primary location</span>
        <EntityCombobox v-model="locationId" :options="locations ?? []" placeholder="Search locations…" @update:model-value="saveMetadata" />
      </label>

      <label class="flex flex-col gap-1 sm:col-span-2">
        <span class="text-label font-semibold text-muted-foreground">Part of quest</span>
        <EntityCombobox v-model="parentQuestId" :options="parentQuestOptions" placeholder="Search quests…" @update:model-value="saveMetadata" />
      </label>

      <div class="flex flex-col gap-1 sm:col-span-2">
        <span class="text-label font-semibold text-muted-foreground">Tags</span>
        <TagInput v-model="tags" @update:model-value="queueTagSave" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AudienceRevealControl from "@/components/common/AudienceRevealControl.vue";
import TagInput from "@/components/common/TagInput.vue";
import { sendCampaignAnnouncement } from "@/composables/useCampaignBroadcast";
import { useAllLocations } from "@/composables/useLocations";
import { useNpcs } from "@/composables/useNpcs";
import { scheduleQuestTriggers, useAllQuests, useUpdateQuest } from "@/composables/useQuests";
import { useCampaignStore } from "@/stores/campaign";
import { QUEST_STATUSES, QUEST_STATUS_LABELS, type Quest, type QuestStatus } from "@/types/quest.types";

const props = defineProps<{ quest: Quest }>();
const campaign = useCampaignStore();
const { data: npcs } = useNpcs();
const { data: locations } = useAllLocations();
const { data: allQuests } = useAllQuests();
const { mutateAsync: updateQuest } = useUpdateQuest();

const title = ref("");
const status = ref<QuestStatus>("undiscovered");
const giverNpcId = ref("");
const locationId = ref("");
const parentQuestId = ref("");
const tags = ref<string[]>([]);
const playerVisibleTo = ref<string[]>([]);
const saving = ref(false);
const saveError = ref("");
let saveQueued = false;
let tagTimer: ReturnType<typeof setTimeout> | undefined;

const parentQuestOptions = computed(() => (allQuests.value ?? [])
  .filter((candidate) => candidate.id !== props.quest.id)
  .map((candidate) => ({ id: candidate.id, name: candidate.title || "Untitled Quest" })));

function syncFromQuest() {
  title.value = props.quest.title ?? "";
  status.value = props.quest.status;
  giverNpcId.value = props.quest.giver_npc_id ?? "";
  locationId.value = props.quest.location_id ?? "";
  parentQuestId.value = props.quest.parent_quest_id ?? "";
  tags.value = [...(props.quest.tags ?? [])];
  playerVisibleTo.value = [...(props.quest.player_visible_to ?? [])];
}

watch(() => props.quest.id, syncFromQuest, { immediate: true });

function onRevealChange(next: string[]) {
  playerVisibleTo.value = next;
  void saveMetadata();
}

async function saveMetadata() {
  if (saving.value) {
    saveQueued = true;
    return;
  }
  const previousStatus = props.quest.status;
  const wasShared = (props.quest.player_visible_to?.length ?? 0) > 0;
  saving.value = true;
  saveError.value = "";
  try {
    const nextTitle = title.value.trim() || "Untitled Quest";
    await updateQuest({
      id: props.quest.id,
      update: {
        title: nextTitle,
        status: status.value,
        giver_npc_id: giverNpcId.value || null,
        location_id: locationId.value || null,
        parent_quest_id: parentQuestId.value || null,
        tags: tags.value,
        player_visible_to: playerVisibleTo.value,
      },
    });
    if (previousStatus !== "completed" && status.value === "completed" && campaign.activeCampaignId) {
      void scheduleQuestTriggers(props.quest.id, "quest_complete", null, {
        year: campaign.todayYear,
        month: campaign.todayMonth,
        day: campaign.todayDay,
      }, campaign.activeCampaignId);
    }
    if (!wasShared && playerVisibleTo.value.length && campaign.activeCampaignId) {
      void sendCampaignAnnouncement(campaign.activeCampaignId, `📋 Quest shared: "${nextTitle}"`, {
        entity_type: "quest",
        entity_id: props.quest.id,
      });
    }
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : "Could not save";
  } finally {
    saving.value = false;
    if (saveQueued) {
      saveQueued = false;
      void saveMetadata();
    }
  }
}

function queueTagSave() {
  clearTimeout(tagTimer);
  tagTimer = setTimeout(() => void saveMetadata(), 600);
}

onBeforeUnmount(() => clearTimeout(tagTimer));
</script>
