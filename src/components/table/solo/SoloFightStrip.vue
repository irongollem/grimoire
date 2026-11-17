<template>
  <!-- The fight screen is on the Dungeon Master's side of the app; a fight from the AI table says whose story it
       belongs to and is one press from it. -->
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card px-4 py-1.5" data-testid="solo-fight-strip">
    <span class="text-eyebrow text-destructive">A fight in your story</span>
    <span class="min-w-0 flex-1 text-caption text-muted-foreground">Fight it here. The story goes on from how it ends.</span>
    <AppButton variant="link" size="inline" :icon="IconChevronLeft" label="Back to the story" @click="back" />
  </div>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronLeft } from "@/lib/icons";
import { useAppUiStore } from "@/stores/ui/app";

const { sessionId, memberId } = defineProps<{ sessionId: string; memberId: string }>();
const router = useRouter();
const appUi = useAppUiStore();

function back(): void {
  // The story is read as the played character, so the lens goes back on before the page opens.
  appUi.enterTablePlay(memberId, sessionId);
  void router.push(`/play/table/${sessionId}`);
}
</script>
