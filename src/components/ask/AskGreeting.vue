<template>
  <!-- The empty Familiar: Ooru speaks first, in its own reply style, and can be heard before its paid voice is on. -->
  <div class="flex flex-col gap-3 py-3" data-testid="ask-greeting">
    <!-- Ooru introduces itself, so it is seen properly here: the header's small avatar is for while it talks. It moves
         while its greeting plays. -->
    <FamiliarAvatar v-if="text" class="size-24 self-center" :speaking="hear.playing.value === KEY" data-testid="ask-greeting-portrait" />
    <AskReply v-if="text" :text="text" who="Ooru" />
    <p v-else class="py-3 text-center text-body text-muted-foreground" data-testid="ask-greeting-fallback">{{ HINT }}</p>
    <div v-if="text" class="flex flex-col items-start gap-1.5">
      <AppButton
        v-if="greeting.data.value?.canSpeak"
        variant="outline"
        size="sm"
        :icon="hear.playing.value === KEY ? IconStop : IconVolume"
        :label="hear.playing.value === KEY ? 'Stop' : 'Hear Ooru'"
        :loading="hear.loading.value === KEY"
        :aria-pressed="hear.playing.value === KEY"
        data-testid="ask-greeting-hear"
        @click="hear.toggle(KEY)"
      />
      <p v-if="hear.problem.value" role="alert" class="text-caption text-destructive">{{ hear.problem.value }}</p>
      <p class="text-caption text-muted-foreground">{{ HINT }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * What the Familiar opens with while the conversation is empty. The greeting is read once (long stale time); hearing it
 * is a kept recording, so it is free and shows no price. It never plays by itself. A failed or empty greeting leaves
 * only the plain line the empty state always had.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AskReply from "@/components/ask/AskReply.vue";
import FamiliarAvatar from "@/components/ask/FamiliarAvatar.vue";
import { useFamiliarGreeting, useFamiliarSample } from "@/composables/voices/useSpeechVoices";
import { IconStop, IconVolume } from "@/lib/icons";

const HINT = "Ask what your campaign already says, ask for ideas, or ask for something to be made.";
const KEY = "familiar";

const greeting = useFamiliarGreeting();
const hear = useFamiliarSample();
const text = computed(() => {
  const said = greeting.data.value?.text ?? null;
  return said !== null && said.trim() !== "" ? said : null;
});
</script>
