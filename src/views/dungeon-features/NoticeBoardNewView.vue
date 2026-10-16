<template>
  <PageHeader title="New Notice Board" description="A board to pin quests to, and for players to take them from.">
    <template #actions>
      <AppButton variant="ghost" size="inline" label="Cancel" @click="goToList" />
      <PageHeaderAction
        variant="primary"
        :disabled="creating || !name.trim() || !campaignId"
        :label="creating ? 'Creating…' : 'Create'"
        :collapse-label-on-mobile="false"
        @click="onCreate"
      />
    </template>

    <div class="flex max-w-2xl flex-col gap-5">
      <div class="space-y-1.5">
        <label for="notice-board-name" class="text-eyebrow font-semibold text-muted-foreground">Name</label>
        <AppInput
          id="notice-board-name"
          v-model="name"
          tone="card"
          size="heading"
          placeholder="The Notice Board at The Pulled Sugar Inn"
          @keydown.enter.prevent="onCreate"
        />
      </div>

      <div class="space-y-1.5">
        <p class="text-eyebrow font-semibold text-muted-foreground">Surface</p>
        <NoticeBoardSurfaceChoice v-model="surface" />
      </div>

      <p v-if="!campaignId" class="text-caption text-muted-foreground italic">
        Notice boards belong to a campaign. Pick a campaign first.
      </p>
      <p v-if="createError" role="alert" class="text-caption text-destructive">{{ createError }}</p>
    </div>
  </PageHeader>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateNoticeBoard } from "@/composables/noticeBoards/useNoticeBoards";
import type { NoticeBoardSurface } from "@/types/noticeBoard.types";
import PageHeader from "@/components/common/list/PageHeader.vue";
import PageHeaderAction from "@/components/common/list/PageHeaderAction.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import NoticeBoardSurfaceChoice from "@/components/noticeBoard/editor/NoticeBoardSurfaceChoice.vue";

const router = useRouter();
const { activeCampaignId: campaignId } = storeToRefs(useCampaignStore());
const { mutateAsync: createBoard } = useCreateNoticeBoard();

const name = ref("");
const surface = ref<NoticeBoardSurface>("cork");
const creating = ref(false);
const createError = ref("");

const goToList = () => router.push("/dungeon-craft?tab=notice-boards");

async function onCreate() {
  const trimmed = name.value.trim();
  // A board is campaign-bound: the database refuses one without a campaign, so the button is off without one.
  if (!trimmed || !campaignId.value || creating.value) return;
  creating.value = true;
  createError.value = "";
  try {
    await createBoard({ campaign_id: campaignId.value, name: trimmed, surface: surface.value });
    // Create keeps its one explicit save and lands on the list, which is the confirmation.
    await goToList();
  } catch (error) {
    createError.value = error instanceof Error ? error.message : "The board could not be created.";
  } finally {
    creating.value = false;
  }
}
</script>
