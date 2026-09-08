<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-3 border-b border-border bg-muted/20">
      <span class="text-label-lg font-semibold text-muted-foreground">Milestones</span>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        What the party has earned, newest first — awarded from a quest's payoff or added here.
      </p>
    </div>

    <div class="p-4">
      <p v-if="milestones.length === 0" class="text-body text-muted-foreground italic">
        No milestones yet.
      </p>

      <div v-else class="space-y-2">
        <div
          v-for="milestone in milestones"
          :key="milestone.id"
          class="flex items-start gap-3 p-2.5 rounded-lg border border-border bg-background group"
        >
          <div class="flex-1 min-w-0">
            <p class="text-body text-foreground">{{ milestone.text }}</p>
            <p class="text-caption text-muted-foreground">
              <template v-if="questTitle(milestone.quest_id)">
                <RouterLink :to="`/quests/${milestone.quest_id}`" class="text-primary hover:underline">{{ questTitle(milestone.quest_id) }}</RouterLink>
                <span> · </span>
              </template>
              {{ timeAgo(milestone.created_at) }}
            </p>
          </div>
          <AppButton
            variant="ghost"
            tone="danger"
            size="inline-xs"
            class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-all"
            :icon="IconClose"
            @click="removeMilestone(milestone.id)"
          />
        </div>
      </div>

      <!-- Inline add -->
      <div class="flex items-center gap-2 mt-3">
        <AppInput
          v-model="newText"
          tone="filled"
          size="sm"
          placeholder="What has the party earned…"
          block
        />
        <AppButton
          variant="subtle"
          size="sm"
          class="shrink-0"
          label="Add milestone"
          :disabled="!newText.trim() || isAdding"
          @click="addMilestone"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink } from "vue-router";
import { IconClose } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useCampaignStore } from "@/stores/campaign";
import { timeAgo } from "@/lib/utils";
import {
  usePartyMilestones,
  useCreatePartyMilestone,
  useDeletePartyMilestone,
} from "@/composables/party/usePartyMilestones";
import { useQuests } from "@/composables/quests/useQuests";

const { confirm } = useConfirm();
const campaign = useCampaignStore();

const { data: milestonesRaw } = usePartyMilestones();
const { data: quests } = useQuests();
const createMut = useCreatePartyMilestone();
const deleteMut = useDeletePartyMilestone();

// Newest first — the composable fetches oldest first for a stable insert order.
const milestones = computed(() => (milestonesRaw.value ?? []).slice().reverse());

const questById = computed(() =>
  Object.fromEntries((quests.value ?? []).map((q) => [q.id, q.title])),
);
function questTitle(questId: string | null): string | null {
  return questId ? (questById.value[questId] ?? null) : null;
}

async function removeMilestone(id: string) {
  const campaignId = campaign.activeCampaignId;
  if (!campaignId) return;
  const ok = await confirm("Delete this milestone? This can't be undone.", {
    title: "Delete milestone",
    confirmLabel: "Delete",
  });
  if (!ok) return;
  await deleteMut.mutateAsync({ id, campaignId });
}

const newText = ref("");
const isAdding = computed(() => createMut.isPending.value);

async function addMilestone() {
  const text = newText.value.trim();
  if (!text) return;
  const campaignId = campaign.activeCampaignId;
  if (!campaignId) return;
  await createMut.mutateAsync({
    campaign_id: campaignId,
    quest_id: null,
    text,
    source_event_id: null,
  });
  newText.value = "";
}
</script>
