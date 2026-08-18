<template>
  <section class="mx-auto w-full max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5" aria-labelledby="new-flow-heading">
    <div>
      <p class="text-label font-bold uppercase tracking-wider text-primary">New quest</p>
      <h2 id="new-flow-heading" class="font-cinzel text-lg font-bold text-foreground">Name the quest and what it is about</h2>
      <p class="mt-1 text-body text-muted-foreground">The overview opens next — the quest's premise, stakes, rewards, and the material that spans the whole story. Build the beats from there once you know what the quest is.</p>
    </div>

    <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <label class="grid gap-1.5">
        <span class="text-label-lg font-semibold text-muted-foreground">Quest title</span>
        <AppInput v-model="title" size="lg" placeholder="The road beneath the lake…" @keydown.enter="createFlow" />
      </label>
      <label class="grid gap-1.5">
        <span class="text-label-lg font-semibold text-muted-foreground">Starting lane</span>
        <AppSelect v-model="status" size="lg" block aria-label="Starting quest lane">
          <option v-for="candidate in QUEST_STATUSES" :key="candidate" :value="candidate">{{ QUEST_STATUS_LABELS[candidate] }}</option>
        </AppSelect>
      </label>
    </div>

    <label class="grid gap-1.5">
      <span class="text-label-lg font-semibold text-muted-foreground">Premise <span class="font-normal">(optional)</span></span>
      <AppInput v-model="summary" placeholder="What makes this quest matter at the table?" />
    </label>

    <p v-if="error" role="alert" class="rounded-md border border-destructive/40 p-2 text-caption text-destructive">{{ error }}</p>
    <div class="flex flex-wrap justify-end gap-2">
      <AppButton to="/quests" label="Cancel" variant="subtle" :disabled="saving" />
      <AppButton label="Create quest" variant="primary" :loading="saving" :disabled="!title.trim()" @click="createFlow" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useCreateQuest } from "@/composables/useQuests";
import { useUiStore } from "@/stores/ui";
import { QUEST_STATUSES, QUEST_STATUS_LABELS, type QuestStatus } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";

const { parentId = null } = defineProps<{ parentId?: string | null }>();
const router = useRouter();
const ui = useUiStore();
const createQuest = useCreateQuest();
const title = ref("");
const summary = ref("");
const status = ref<QuestStatus>("undiscovered");
const saving = ref(false);
const error = ref("");

async function createFlow() {
  if (!title.value.trim() || saving.value) return;
  saving.value = true;
  error.value = "";
  try {
    const created = await createQuest.mutateAsync({
      parent_quest_id: parentId,
      title: title.value.trim(),
      summary: summary.value.trim() || null,
      status: status.value,
      giver_npc_id: null,
      location_id: null,
      rewards: null,
      reward_pp: 0,
      reward_gp: 0,
      reward_ep: 0,
      reward_sp: 0,
      reward_cp: 0,
      tags: [],
      description: null,
      notes: null,
      player_visible_to: [],
      reward_item_ids: [],
      reward_currency_pools: [],
      started_at: null,
      resolved_at: null,
    });
    ui.dmMode = "prep";
    // Prep's default surface is the overview, so a bare detail path lands there.
    await router.push(`/quests/${created.id}`);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "The quest flow could not be created";
  } finally {
    saving.value = false;
  }
}
</script>
