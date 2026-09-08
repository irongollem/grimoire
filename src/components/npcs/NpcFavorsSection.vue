<template>
  <section class="w-full">
    <div class="flex items-center justify-between mb-1 w-full">
      <div class="text-heading-sm font-bold text-foreground">Favours owed</div>
    </div>
    <div class="gold-divider mb-3" />

    <p
      v-if="favors.length === 0"
      class="text-body text-muted-foreground italic"
    >
      This NPC owes the party nothing yet.
    </p>

    <div v-else class="space-y-2">
      <div
        v-for="favor in unsettled"
        :key="favor.id"
        class="flex items-start gap-3 p-2.5 rounded-lg border border-border bg-card"
      >
        <div class="flex-1 min-w-0">
          <p class="text-body text-foreground">{{ favor.text }}</p>
          <p class="text-caption text-muted-foreground">
            <template v-if="questTitle(favor.quest_id)">
              <RouterLink :to="`/quests/${favor.quest_id}`" class="text-primary hover:underline">{{ questTitle(favor.quest_id) }}</RouterLink>
              <span> · </span>
            </template>
            since {{ timeAgo(favor.created_at) }}
          </p>
        </div>
        <AppButton
          variant="subtle"
          size="xs"
          label="Settle"
          :loading="isSettling(favor.id)"
          @click="settle(favor.id)"
        />
      </div>

      <template v-if="settled.length > 0">
        <div class="flex items-center gap-2 mt-3 mb-1">
          <span class="text-label font-semibold text-muted-foreground uppercase">Settled</span>
          <div class="flex-1 h-px bg-border" />
        </div>
        <div
          v-for="favor in settled"
          :key="favor.id"
          class="flex items-start gap-3 p-2.5 rounded-lg border border-border bg-card opacity-60 group"
        >
          <div class="flex-1 min-w-0">
            <p class="text-body text-muted-foreground line-through">{{ favor.text }}</p>
            <p class="text-caption text-muted-foreground">
              <template v-if="questTitle(favor.quest_id)">
                <RouterLink :to="`/quests/${favor.quest_id}`" class="text-primary hover:underline">{{ questTitle(favor.quest_id) }}</RouterLink>
                <span> · </span>
              </template>
              settled {{ timeAgo(favor.settled_at!) }}
            </p>
          </div>
          <AppButton
            variant="ghost"
            tone="danger"
            size="inline-xs"
            class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-all"
            :icon="IconClose"
            @click="removeFavor(favor.id)"
          />
        </div>
      </template>
    </div>

    <!-- Inline add -->
    <div class="flex items-center gap-2 mt-3">
      <AppInput
        v-model="newText"
        tone="filled"
        size="sm"
        placeholder="What do they owe the party…"
        block
      />
      <AppButton
        variant="subtle"
        size="sm"
        class="shrink-0"
        label="Add favour"
        :disabled="!newText.trim() || isAdding"
        @click="addFavor"
      />
    </div>
  </section>
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
  useNpcFavors,
  useCreateNpcFavor,
  useSettleNpcFavor,
  useDeleteNpcFavor,
} from "@/composables/npcs/useNpcFavors";
import { useQuests } from "@/composables/quests/useQuests";

const props = defineProps<{ npcId: string }>();

const { confirm } = useConfirm();
const campaign = useCampaignStore();

const { data: favorsRaw } = useNpcFavors(props.npcId);
const { data: quests } = useQuests();
const createMut = useCreateNpcFavor();
const settleMut = useSettleNpcFavor();
const deleteMut = useDeleteNpcFavor();

const favors = computed(() => favorsRaw.value ?? []);
const unsettled = computed(() => favors.value.filter((f) => !f.settled_at));
const settled = computed(() => favors.value.filter((f) => f.settled_at));

const questById = computed(() =>
  Object.fromEntries((quests.value ?? []).map((q) => [q.id, q.title])),
);
function questTitle(questId: string | null): string | null {
  return questId ? (questById.value[questId] ?? null) : null;
}

const settlingId = ref<string | null>(null);
function isSettling(id: string): boolean {
  return settlingId.value === id && settleMut.isPending.value;
}

async function settle(id: string) {
  settlingId.value = id;
  await settleMut.mutateAsync({ id, npcId: props.npcId });
}

async function removeFavor(id: string) {
  const ok = await confirm("Delete this favour? This can't be undone.", {
    title: "Delete favour",
    confirmLabel: "Delete",
  });
  if (!ok) return;
  await deleteMut.mutateAsync({ id, npcId: props.npcId });
}

const newText = ref("");
const isAdding = computed(() => createMut.isPending.value);

async function addFavor() {
  const text = newText.value.trim();
  if (!text) return;
  const campaignId = campaign.activeCampaignId;
  if (!campaignId) return;
  await createMut.mutateAsync({
    campaign_id: campaignId,
    npc_id: props.npcId,
    quest_id: null,
    text,
    source_event_id: null,
  });
  newText.value = "";
}
</script>
