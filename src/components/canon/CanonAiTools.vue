<template>
  <div v-if="isAiEnabled" class="flex flex-col gap-3" data-testid="canon-ai-tools">
    <div class="flex flex-wrap items-center justify-end gap-2">
      <AppButton
        variant="outline"
        fill="muted"
        size="sm"
        :icon="IconGenerate"
        icon-size="xs"
        label="Shape the world"
        :active="walking"
        @click="walking = !walking"
      />
    </div>
    <ShapeTheWorld v-if="walking" @close="walking = false" />
    <CanonReadThrough />
  </div>
</template>

<script setup lang="ts">
/**
 * The Canon page's whole-canon AI tools (#1255 item 7), for the DM: "Shape the world" opens the guided walk through the
 * helpers, "Read it through" lists what does not hold together. Nothing here writes; the walk's steps write only when
 * the DM accepts a suggestion, and the read never does. Hidden when AI is off for the campaign.
 */
import { computed, ref } from "vue";
import { IconGenerate } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import CanonReadThrough from "./CanonReadThrough.vue";
import ShapeTheWorld from "./ShapeTheWorld.vue";
import { useCampaignStore } from "@/stores/campaign";

const campaign = useCampaignStore();
const isAiEnabled = computed(() => campaign.isAiEnabled);
const walking = ref(false);
</script>
