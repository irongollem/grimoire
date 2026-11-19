<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
      <div class="min-w-0">
        <span class="text-label-lg font-semibold text-muted-foreground">Levels</span>
        <p class="mt-0.5 text-caption italic text-muted-foreground">
          The party gains a level when the story reaches a milestone. Each player then levels up their own character.
        </p>
      </div>
      <label class="flex shrink-0 items-center gap-2 text-label text-muted-foreground">
        Party level
        <AppSelect v-model.number="partyLevel" size="sm" aria-label="Party level">
          <option :value="null">Not set</option>
          <option v-for="n in 20" :key="n" :value="n">{{ n }}</option>
        </AppSelect>
      </label>
    </div>

    <div class="space-y-2 p-4">
      <p v-if="!milestones?.length && editing === null" class="text-body italic text-muted-foreground">
        No milestones yet. Add one to say which quests bring the next level.
      </p>

      <template v-for="m in milestones ?? []" :key="m.id">
        <LevelMilestoneEditor
          v-if="editing === m.id"
          :milestone="m"
          :taken-levels="takenLevels"
          @done="editing = null"
        />
        <div v-else class="group rounded-lg border border-border bg-muted/40 p-2.5">
          <div class="flex items-start gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-body text-foreground">
                <span class="font-semibold">Level {{ m.level }}</span>
                <span class="text-muted-foreground">
                  · {{ m.reachedAt ? "reached" : `${doneCount(m)} of ${m.needs} done` }}
                  <template v-if="m.needs < m.items.length"> (any {{ m.needs }} of {{ m.items.length }})</template>
                </span>
              </p>
              <p v-if="m.note" class="text-caption text-muted-foreground">{{ m.note }}</p>
            </div>
            <div class="flex shrink-0 gap-1 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
              <AppButton variant="ghost" size="inline-xs" :icon="IconEdit" :aria-label="`Edit level ${m.level}`" @click="editing = m.id" />
              <AppButton
                variant="ghost"
                tone="danger"
                size="inline-xs"
                :icon="IconClose"
                :aria-label="`Delete level ${m.level}`"
                @click="remove(m)"
              />
            </div>
          </div>
          <ul class="mt-1.5 space-y-0.5">
            <li v-for="item in m.items" :key="item.id" class="flex items-center gap-1.5 text-caption">
              <component
                :is="item.done ? IconCheck : IconCircle"
                class="h-3.5 w-3.5 shrink-0"
                :class="item.done ? 'text-primary' : 'text-muted-foreground'"
                :aria-label="item.done ? 'Done' : 'Not done yet'"
              />
              <RouterLink v-if="item.questId" :to="`/quests/${item.questId}`" class="truncate text-foreground hover:underline">
                {{ item.label }}
              </RouterLink>
              <span v-else class="truncate text-foreground">
                {{ item.label }}<span v-if="item.questTitle" class="text-muted-foreground"> · {{ item.questTitle }}</span>
              </span>
            </li>
          </ul>
        </div>
      </template>

      <LevelMilestoneEditor v-if="editing === 'new'" :taken-levels="takenLevels" @done="editing = null" />
      <AppButton
        v-else-if="takenLevels.length < 19"
        variant="dashed"
        size="sm"
        label="Add a milestone"
        @click="editing = 'new'"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { IconCheck, IconCircle, IconClose, IconEdit } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import LevelMilestoneEditor from "./LevelMilestoneEditor.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import {
  useDeleteLevelMilestone,
  useLevelMilestones,
  type LevelMilestone,
} from "@/composables/party/useLevelMilestones";

const campaign = useCampaignStore();
const { confirm } = useConfirm();
const { data: milestones } = useLevelMilestones();
const deleteMut = useDeleteLevelMilestone();
const updateCampaign = useUpdateCampaign();

/** The milestone open in the editor, `new` for one being made, or null. */
const editing = ref<string | null>(null);

const takenLevels = computed(() => (milestones.value ?? []).map((m) => m.level));

function doneCount(m: LevelMilestone): number {
  return m.items.filter((i) => i.done).length;
}

// The DM sets where the party starts, or puts it right by hand; reaching a milestone only ever raises it.
const partyLevel = computed<number | null>({
  get: () => campaign.activeCampaign?.party_level ?? null,
  set: (value) => {
    const id = campaign.activeCampaignId;
    if (!id) return;
    updateCampaign.mutate({ id, update: { party_level: value } });
  },
});

async function remove(m: LevelMilestone) {
  const campaignId = campaign.activeCampaignId;
  if (!campaignId) return;
  const ok = await confirm(`Delete the milestone for level ${m.level}? The party level stays as it is.`, {
    title: "Delete milestone",
    confirmLabel: "Delete",
  });
  if (!ok) return;
  await deleteMut.mutateAsync({ id: m.id, campaignId });
}
</script>
