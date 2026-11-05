<template>
  <div v-if="place" class="flex flex-wrap items-center gap-x-2 gap-y-1">
    <label class="flex items-center gap-2">
      <span class="text-label uppercase text-muted-foreground">Sound</span>
      <ThemeInput v-model="draft.theme" :suggestions="themes" :placeholder="placeholder" class="w-72 max-sm:w-full" />
    </label>
    <AppButton
      v-if="playable"
      variant="outline"
      size="icon-sm"
      :icon="playing ? IconStop : IconMusicNote"
      :active="playing"
      :aria-label="playing ? 'Stop the ambience' : 'Play the ambience'"
      :tooltip="playing ? 'Stop the ambience' : 'Play the ambience'"
      @click="toggle"
    />
    <AutosaveStatus :status="status" :error="saveError" />
    <p class="w-full text-caption text-muted-foreground">
      <template v-if="unanswered">No ambient scene is tagged “{{ unanswered }}” yet, so nothing plays. </template>
      This is the ambience of {{ place.name }} in your Atlas: changing it here changes it there too.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * The nook's sound, which is the ambience of the place that shows it (#1142 decision 13, story 15). Hidden for a
 * nook shown at no place. Play is by hand and keeps going after the DM leaves, as on the Atlas pane.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import ThemeInput from "@/components/common/controls/ThemeInput.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import { useNookPlaceSound } from "@/composables/bookNook/useNookPlaceSound";
import { IconMusicNote, IconStop } from "@/lib/icons";

const { nookId } = defineProps<{ nookId: string }>();

const { place, draft, placeholder, themes, playable, playing, unanswered, toggle, status, saveError } = useNookPlaceSound(
  () => nookId,
);
</script>
